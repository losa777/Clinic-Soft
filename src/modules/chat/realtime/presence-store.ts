import { prisma } from "@/lib/db";
import { presenceStatus } from "@/modules/chat/presence";
import type { ChatServer } from "@/modules/chat/realtime/registry";
import type { ManualStatus, Presence, PresenceStatus, PresenceUpdate } from "@/modules/chat/types";

/**
 * „არ არის კომპიუტერთან“-ის ზღვარი წუთებში (.env.local: CHAT_AWAY_MINUTES, ნაგულისხმევად 5).
 * წაიკითხება სერვერის გაშვებისას.
 */
export function awayMsFromEnv(): number {
  const minutes = Number(process.env.CHAT_AWAY_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60_000;
}

/** ბოლო ტაბის დახურვის შემდეგ ამდენი ხანი ველოდებით (გვერდის განახლება / ქსელის წამიერი გაწყვეტა „გასვლა“ არ არის). */
const OFFLINE_GRACE_MS = 5_000;
/** რამდენ ხანში ერთხელ მოწმდება აქტიური → არ არის კომპიუტერთან. */
const SWEEP_MS = 15_000;
/** ბაზაში last_active_at / last_seen_at იწერება მაქსიმუმ ერთხელ ამ ინტერვალში მომხმარებელზე. */
const PERSIST_MS = 60_000;

/** ბაზაში ჩაწერა: last_active_at / last_seen_at (ტესტებში — ჩანაცვლებადი). */
export type PersistPresence = (userId: number, data: { lastActiveAt?: Date; lastSeenAt?: Date }) => Promise<void>;

async function persistToDb(userId: number, data: { lastActiveAt?: Date; lastSeenAt?: Date }) {
  try {
    await prisma.userPresence.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  } catch (error) {
    console.error("ჩატი: სტატუსი ვერ ჩაიწერა:", userId, error);
  }
}

type UserState = {
  /** socket.id → ბოლო აქტივობა (ms) */
  connections: Map<string, number>;
  manual: ManualStatus;
  status: PresenceStatus;
  offlineTimer: ReturnType<typeof setTimeout> | null;
  persistedAt: number;
};

/**
 * სტატუსები მეხსიერებაში, ყველა კავშირის (ტაბი/კომპიუტერი) მიხედვით. ცვლილება ეგზავნება ყველა შესულს (`presence`).
 * ერთი პროცესი (server.ts); რამდენიმე instance-ზე საჭირო იქნება საერთო საცავი (Redis adapter).
 */
export class PresenceStore {
  private users = new Map<number, UserState>();
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly io: Pick<ChatServer, "emit">,
    private readonly awayMs: number,
    private readonly persist: PersistPresence = persistToDb,
  ) {
    this.timer = setInterval(() => this.sweep(), SWEEP_MS);
    this.timer.unref?.();
  }

  /** ახალი კავშირი. lastActiveAt — ბრაუზერის ბოლო აქტივობა (ტაბებს შორის საერთო), არა დაკავშირების დრო. */
  connect(userId: number, socketId: string, lastActiveAt: number, manual: ManualStatus) {
    const state = this.state(userId);
    if (state.offlineTimer) clearTimeout(state.offlineTimer);
    state.offlineTimer = null;
    state.manual = manual;
    state.connections.set(socketId, lastActiveAt);
    this.update(userId);
  }

  activity(userId: number, socketId: string, now = Date.now()) {
    const state = this.users.get(userId);
    if (!state?.connections.has(socketId)) return;
    state.connections.set(socketId, now);
    this.update(userId);
    if (now - state.persistedAt >= PERSIST_MS) {
      state.persistedAt = now;
      void this.persist(userId, { lastActiveAt: new Date(now), lastSeenAt: new Date(now) });
    }
  }

  /**
   * კავშირი დაიხურა. immediate — სერვერმა გათიშა (გასვლა, სესიის ვადა, გათიშული მომხმარებელი): „გასულია“ მაშინვე;
   * სხვაგვარად (ტაბი დაიხურა, ქსელი) — OFFLINE_GRACE_MS-ის შემდეგ, თუ ხელახლა არ დაუკავშირდა.
   */
  disconnect(userId: number, socketId: string, immediate: boolean) {
    const state = this.users.get(userId);
    if (!state) return;
    state.connections.delete(socketId);
    if (state.connections.size > 0) return this.update(userId);
    if (state.offlineTimer) clearTimeout(state.offlineTimer);
    const goOffline = () => {
      state.offlineTimer = null;
      if (state.connections.size > 0) return;
      this.update(userId);
      this.users.delete(userId);
      void this.persist(userId, { lastSeenAt: new Date() });
    };
    if (immediate) goOffline();
    else state.offlineTimer = setTimeout(goOffline, OFFLINE_GRACE_MS);
  }

  /** „არ შემაწუხოთ“ ჩართვა/გამორთვა (ბაზაში წერს API). */
  setManual(userId: number, manual: ManualStatus) {
    const state = this.users.get(userId);
    if (!state) return;
    state.manual = manual;
    this.update(userId);
  }

  /** მიმდინარე სტატუსი; offline — თუ შესული არ არის (lastSeenAt-ს ბაზიდან ავსებს server/presence.ts). */
  get(userId: number): PresenceStatus {
    return this.users.get(userId)?.status ?? "offline";
  }

  /** ყველა შესული (არა offline) — ახალ კავშირს ეგზავნება. */
  snapshot(): PresenceUpdate[] {
    const list: PresenceUpdate[] = [];
    for (const [userId, s] of this.users) if (s.status !== "offline") list.push({ userId, status: s.status, lastSeenAt: null });
    return list;
  }

  stop() {
    clearInterval(this.timer);
  }

  private state(userId: number): UserState {
    let s = this.users.get(userId);
    if (!s) {
      s = { connections: new Map(), manual: null, status: "offline", offlineTimer: null, persistedAt: 0 };
      this.users.set(userId, s);
    }
    return s;
  }

  /** სტატუსის ხელახლა გამოთვლა; შეიცვალა — ეგზავნება ყველას. */
  private update(userId: number, now = Date.now()) {
    const s = this.users.get(userId);
    // მოლოდინის დროს (ბოლო ტაბი დაიხურა, OFFLINE_GRACE_MS) სტატუსი უცვლელია — სხვაგვარად sweep ადრე აჩენდა „გასულია“-ს
    if (!s || s.offlineTimer) return;
    const status = presenceStatus(s.connections.values(), s.manual, now, this.awayMs);
    if (status === s.status) return;
    s.status = status;
    const presence: Presence = { status, lastSeenAt: status === "offline" ? new Date(now).toISOString() : null };
    this.io.emit("presence", { userId, ...presence });
  }

  /** აქტიური → არ არის კომპიუტერთან (დრო გავიდა, მოვლენა არ ყოფილა). */
  private sweep() {
    const now = Date.now();
    for (const userId of this.users.keys()) this.update(userId, now);
  }

}
