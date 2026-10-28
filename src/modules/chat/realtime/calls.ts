import type { CallAck, CallEndReason, CallSignal, PresenceStatus, ServerToClientEvents, SystemEvent, UserRef } from "@/modules/chat/types";

/**
 * ზარები (1:1, მხოლოდ ხმა): სერვერი მხოლოდ „სიგნალს“ გადასცემს (ვინ ვის ურეკავს, პასუხი, WebRTC offer/answer/ICE),
 * ხმა კი პირდაპირ ორ ბრაუზერს შორის მიდის (კლინიკის ქსელში — სერვერის გავლის გარეშე).
 * - მდგომარეობა მეხსიერებაშია (ერთი პროცესი, server.ts); სერვერის გადატვირთვისას მიმდინარე ზარები წყდება.
 * - შემომავალი ზარი რეკავს მომხმარებლის ყველა ტაბში; პასუხის შემდეგ ზარი ერთ ტაბს ებმება, დანარჩენები ჩერდება.
 * - ისტორია: დასრულებისას პირად საუბარში სისტემური შეტყობინება (call_ended / call_missed / call_declined).
 */

/** პასუხის მოლოდინი — შემდეგ „უპასუხო ზარი“. */
export const RING_MS = 30_000;
const CALL_ID = /^[A-Za-z0-9-]{8,64}$/;
/** SDP აუდიოსთვის რამდენიმე KB-ია; ზედა ზღვარი — Socket.IO-ს maxHttpBufferSize-ის ქვემოთ. */
const SIGNAL_MAX = 12_000;

type Emit = <E extends keyof ServerToClientEvents>(event: E, ...args: Parameters<ServerToClientEvents[E]>) => void;

/** Socket.IO-სა და ბაზასთან კავშირი (ტესტებში — ჩანაცვლებადი). */
export type CallTransport = {
  /** ერთ ტაბს (socket.id) */
  toSocket: (socketId: string) => { emit: Emit };
  /** მომხმარებლის ყველა ტაბს, გარდა except-ისა */
  toUser: (userId: number, exceptSocketId?: string) => { emit: Emit };
  isOnline: (userId: number) => boolean;
  status: (userId: number) => PresenceStatus;
  /** აქტიური თანამშრომელი ან null */
  activeUser: (userId: number) => Promise<UserRef | null>;
  /** ისტორიაში ჩაწერა (შეცდომას თავად ამუშავებს) */
  record: (callerId: number, calleeId: number, event: SystemEvent, seconds?: number) => void;
};

type Call = {
  id: string;
  callerId: number;
  calleeId: number;
  callerSocket: string;
  /** პასუხის შემდეგ — ტაბი, რომელმაც უპასუხა */
  calleeSocket: string | null;
  answeredAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
};

const fail = (error: string): CallAck => ({ ok: false, error });
const ENDED = fail("ზარი უკვე დასრულდა");

function validSignal(s: unknown): s is CallSignal {
  if (!s || typeof s !== "object") return false;
  const v = s as Record<string, unknown>;
  if (v.type === "offer" || v.type === "answer") return typeof v.sdp === "string" && v.sdp.length <= SIGNAL_MAX;
  if (v.type === "restart") return true;
  if (v.type !== "candidate" || !v.candidate || typeof v.candidate !== "object") return false;
  const c = v.candidate as Record<string, unknown>;
  return typeof c.candidate === "string" && c.candidate.length <= 1_000;
}

export class CallRegistry {
  private calls = new Map<string, Call>();
  /** მომხმარებელი → მისი მიმდინარე ზარი (დაკავებულობა) */
  private byUser = new Map<number, string>();

  private readonly transport: CallTransport;
  private readonly ringMs: number;

  // parameter property-ს გარეშე — ტესტები (node --test) TypeScript-ს მხოლოდ ტიპების მოშორებით კითხულობს
  constructor(transport: CallTransport, ringMs = RING_MS) {
    this.transport = transport;
    this.ringMs = ringMs;
  }

  private callOf(userId: number, callId: unknown): Call | null {
    const call = typeof callId === "string" ? this.calls.get(callId) : undefined;
    return call && (call.callerId === userId || call.calleeId === userId) ? call : null;
  }

  async invite(userId: number, socketId: string, e: { callId?: unknown; toUserId?: unknown }): Promise<CallAck> {
    const callId = typeof e?.callId === "string" && CALL_ID.test(e.callId) ? e.callId : null;
    const toUserId = Number(e?.toUserId);
    if (!callId || !Number.isSafeInteger(toUserId) || toUserId === userId) return fail("ზარი ვერ განხორციელდა");
    if (this.calls.has(callId)) return fail("ზარი ვერ განხორციელდა");
    if (this.byUser.has(userId)) return fail("თქვენ უკვე ზარში ხართ");

    const caller = await this.transport.activeUser(userId);
    const callee = await this.transport.activeUser(toUserId);
    if (!caller || !callee) return fail("თანამშრომელი ვერ მოიძებნა ან გათიშულია");
    if (!this.transport.isOnline(toUserId)) return fail("თანამშრომელი ახლა სისტემაში არ არის");
    if (this.transport.status(toUserId) === "dnd") return fail("თანამშრომელს ჩართული აქვს «არ შემაწუხოთ»");
    // await-ის შემდეგ — თავიდან (ერთდროული ზარები)
    if (this.byUser.has(userId)) return fail("თქვენ უკვე ზარში ხართ");
    if (this.byUser.has(toUserId)) return fail("თანამშრომელი ახლა სხვა ზარშია");

    const call: Call = { id: callId, callerId: userId, calleeId: toUserId, callerSocket: socketId, calleeSocket: null, answeredAt: null, timer: null };
    call.timer = setTimeout(() => this.unanswered(call, "missed"), this.ringMs);
    call.timer.unref?.();
    this.calls.set(callId, call);
    this.byUser.set(userId, callId);
    this.byUser.set(toUserId, callId);
    this.transport.toUser(toUserId).emit("call:incoming", { callId, from: caller });
    return { ok: true };
  }

  accept(userId: number, socketId: string, e: { callId?: unknown }): CallAck {
    const call = this.callOf(userId, e?.callId);
    if (!call || call.calleeId !== userId || call.answeredAt !== null) return ENDED;
    if (call.timer) clearTimeout(call.timer);
    call.timer = null;
    call.calleeSocket = socketId;
    call.answeredAt = Date.now();
    this.transport.toSocket(call.callerSocket).emit("call:accepted", { callId: call.id });
    this.transport.toUser(userId, socketId).emit("call:ended", { callId: call.id, reason: "elsewhere" });
    return { ok: true };
  }

  decline(userId: number, e: { callId?: unknown }) {
    const call = this.callOf(userId, e?.callId);
    if (call && call.calleeId === userId && call.answeredAt === null) this.unanswered(call, "declined");
  }

  hangup(userId: number, socketId: string, e: { callId?: unknown }) {
    const call = this.callOf(userId, e?.callId);
    if (!call) return;
    if (call.answeredAt === null) {
      if (call.callerId === userId) this.unanswered(call, "cancelled");
      else this.unanswered(call, "declined");
      return;
    }
    if (socketId === call.callerSocket || socketId === call.calleeSocket) this.finish(call, socketId, "ended");
  }

  /** WebRTC სიგნალი — მხოლოდ პასუხის შემდეგ, ზარზე მიბმული ტაბიდან მეორე მიბმულ ტაბს. */
  signal(userId: number, socketId: string, e: { callId?: unknown; signal?: unknown }) {
    const call = this.callOf(userId, e?.callId);
    if (!call || call.answeredAt === null || !validSignal(e.signal)) return;
    const other = socketId === call.callerSocket ? call.calleeSocket : socketId === call.calleeSocket ? call.callerSocket : null;
    if (other) this.transport.toSocket(other).emit("call:signal", { callId: call.id, signal: e.signal });
  }

  /** ტაბი დაიხურა / კავშირი გაწყდა. */
  socketGone(userId: number, socketId: string) {
    const callId = this.byUser.get(userId);
    const call = callId ? this.calls.get(callId) : undefined;
    if (!call) return;
    if (call.answeredAt === null) {
      // დამრეკის ტაბი წავიდა — ზარი უქმდება; ვისაც ურეკავენ, მისი სხვა ტაბები ისევ რეკავს
      if (socketId === call.callerSocket) this.unanswered(call, "cancelled");
      return;
    }
    if (socketId === call.callerSocket || socketId === call.calleeSocket) this.finish(call, socketId, "disconnected");
  }

  /** მიმდინარე ზარების რაოდენობა (ტესტები). */
  get size() {
    return this.calls.size;
  }

  private remove(call: Call) {
    if (call.timer) clearTimeout(call.timer);
    this.calls.delete(call.id);
    if (this.byUser.get(call.callerId) === call.id) this.byUser.delete(call.callerId);
    if (this.byUser.get(call.calleeId) === call.id) this.byUser.delete(call.calleeId);
  }

  /** პასუხამდე დასრულება: უარყო / არ უპასუხა / დამრეკმა გათიშა. */
  private unanswered(call: Call, reason: Extract<CallEndReason, "declined" | "missed" | "cancelled">) {
    if (!this.calls.has(call.id)) return;
    this.remove(call);
    this.transport.toSocket(call.callerSocket).emit("call:ended", { callId: call.id, reason });
    this.transport.toUser(call.calleeId).emit("call:ended", { callId: call.id, reason: reason === "declined" ? "elsewhere" : reason });
    this.transport.record(call.callerId, call.calleeId, reason === "declined" ? "call_declined" : "call_missed");
  }

  /** საუბრის დასრულება: მეორე მხარეს ეცნობება, ისტორიაში — ხანგრძლივობა. */
  private finish(call: Call, bySocket: string, reason: Extract<CallEndReason, "ended" | "disconnected">) {
    if (!this.calls.has(call.id)) return;
    this.remove(call);
    const other = bySocket === call.callerSocket ? call.calleeSocket : call.callerSocket;
    if (other) this.transport.toSocket(other).emit("call:ended", { callId: call.id, reason });
    const seconds = Math.round((Date.now() - (call.answeredAt ?? Date.now())) / 1000);
    this.transport.record(call.callerId, call.calleeId, "call_ended", seconds);
  }
}
