import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "@/lib/db";
import { CHAT_SOCKET_PATH, RATE_LIMITS } from "@/modules/chat/config";
import { RateLimiter } from "@/modules/chat/rate-limit";
import { authenticateSocket, isSameOrigin } from "@/modules/chat/realtime/auth";
import { awayMsFromEnv, PresenceStore } from "@/modules/chat/realtime/presence-store";
import { type ChatServer, conversationRoom, sessionRoom, setChatServer, userRoom } from "@/modules/chat/realtime/registry";

/** setTimeout-ის მაქსიმუმი (~24.8 დღე) — უფრო გრძელი დაყოვნება მაშინვე სრულდება. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** ერთი ტაბის აქტივობის შეტყობინებები უფრო ხშირად არ მიიღება (ბრაუზერი აგზავნის ACTIVITY_SEND_MS-ში ერთხელ). */
const ACTIVITY_MIN_INTERVAL_MS = 5_000;

/** სერვერის ინიციატივით გაწყვეტა (გასვლა, სესიის ვადა, გათიშვა) — „გასულია“ მაშინვე, მოლოდინის გარეშე. */
const SERVER_DISCONNECTS = new Set(["server namespace disconnect", "server shutting down"]);

/** ბრაუზერის ბოლო აქტივობა დაკავშირებისას: handshake.auth.idleMs (ტაბებს შორის საერთო), 0…24 სთ. */
function lastActiveAtOf(auth: Record<string, unknown>, now: number): number {
  const idle = Number(auth?.idleMs);
  return Number.isFinite(idle) ? now - Math.min(Math.max(idle, 0), 24 * 60 * 60 * 1000) : now;
}

/**
 * Socket.IO ჩატისთვის, იმავე http სერვერზე, რომელზეც Next (server.ts).
 * - ავტორიზაცია: Auth.js-ის cookie (auth.ts) + is_active ბაზაში; სესიის ვადის ამოწურვისას კავშირი წყდება.
 * - ოთახები: user:<id> (ყველა ტაბი), session:<sid> (ერთი შესვლა), conv:<id> (საუბრის მონაწილეები).
 * - სოკეტით მხოლოდ მიწოდება ხდება; შეტყობინებები და ცვლილებები REST API-თ მოდის (src/app/api/chat/).
 * - heartbeat: ping ყოველ 20 წამში, პასუხის გარეშე 20 წამში — კავშირი გაწყვეტილია (ტაბი დაიხურა / ქსელი).
 * - სტატუსები: presence-store.ts (ყველა კავშირის აქტივობით), ცვლილება — ყველა შესულს.
 */
export function attachChatServer(httpServer: HttpServer): ChatServer {
  const io: ChatServer = new Server(httpServer, {
    path: CHAT_SOCKET_PATH,
    serveClient: false,
    // სხვა upgrade მოთხოვნები (Next-ის HMR) Next-ს ეკუთვნის — Socket.IO მათ არ ხურავს
    destroyUpgrade: false,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 16 * 1024,
    allowRequest: (req, callback) => callback(null, isSameOrigin(req)),
  });

  io.use(async (socket, next) => {
    try {
      const data = await authenticateSocket(socket.request);
      if (!data) return next(new Error("unauthorized"));
      socket.data = data;
      next();
    } catch (error) {
      console.error("ჩატი: სოკეტის ავტორიზაცია ვერ მოხერხდა:", error);
      next(new Error("server_error"));
    }
  });

  const presence = new PresenceStore(io, awayMsFromEnv());
  const typingLimiter = new RateLimiter(RATE_LIMITS.typing.capacity, RATE_LIMITS.typing.windowMs);

  io.on("connection", async (socket) => {
    const { userId, sid, expiresAt } = socket.data;
    const connectedAt = Date.now();
    // იმავე ბრაუზერში სხვა ანგარიშით შესვლისას cookie იცვლება — ძველმა ტაბმა ეს უნდა გაიგოს
    socket.emit("session:user", { userId });

    // სესიის ვადა: კავშირი წყდება; ბრაუზერი ხელახლა დაკავშირებას ცდის (განახლებული cookie-ით ან → შესვლის გვერდი)
    const expiry = setTimeout(() => {
      socket.emit("session:ended", { reason: "expired" });
      socket.disconnect(true);
    }, Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMEOUT_MS));
    let presenceJoined = false;
    socket.on("disconnect", (reason) => {
      clearTimeout(expiry);
      if (presenceJoined) presence.disconnect(userId, socket.id, SERVER_DISCONNECTS.has(reason));
    });

    // ჯერ user-ის ოთახი (ახალი საუბრების joinConversation მას იყენებს), შემდეგ არსებული საუბრები
    await socket.join([userRoom(userId), ...(sid ? [sessionRoom(sid)] : [])]);
    try {
      const memberships = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
      if (socket.connected) await socket.join(memberships.map((m) => conversationRoom(m.conversationId)));
      const stored = await prisma.userPresence.findUnique({ where: { userId }, select: { manualStatus: true } });
      if (!socket.connected) return;
      presence.connect(userId, socket.id, lastActiveAtOf(socket.handshake.auth, connectedAt), stored?.manualStatus ?? null);
      presenceJoined = true;
      socket.emit("presence:snapshot", presence.snapshot());
    } catch (error) {
      console.error("ჩატი: საუბრების ჩატვირთვა ვერ მოხერხდა:", error);
      socket.disconnect(true);
      return;
    }

    let lastActivity = 0;
    socket.on("activity", () => {
      const now = Date.now();
      if (!presenceJoined || now - lastActivity < ACTIVITY_MIN_INTERVAL_MS) return;
      lastActivity = now;
      presence.activity(userId, socket.id, now);
    });

    // „წერს...“ — მხოლოდ საკუთარი საუბრის ოთახში (ოთახი = წევრობა), ლიმიტით
    socket.on("typing", (e) => {
      const conversationId = Number(e?.conversationId);
      if (!Number.isSafeInteger(conversationId)) return;
      const room = conversationRoom(conversationId);
      if (!socket.rooms.has(room) || !typingLimiter.take(String(userId))) return;
      socket.to(room).emit("typing", { conversationId, userId });
    });
  });

  setChatServer(io, presence);
  return io;
}
