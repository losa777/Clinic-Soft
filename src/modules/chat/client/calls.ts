import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import { randomId } from "@/lib/browser-compat";
import { claimNotification, showNotification, startRingtone } from "@/modules/chat/client/notify";
import { Store } from "@/modules/chat/client/store";
import { fullName } from "@/modules/chat/format";
import type { CallAck, CallEndReason, CallSignal, ClientToServerEvents, ServerToClientEvents, UserRef } from "@/modules/chat/types";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * ზარები ბრაუზერში (1:1, ხმა): სიგნალი — ჩატის სოკეტით (realtime/calls.ts), ხმა — WebRTC, პირდაპირ კომპიუტერებს შორის.
 * კლინიკის ქსელში STUN/TURN არ სჭირდება (ICE — ლოკალური მისამართები). მიკროფონი მხოლოდ https-ზე (ან localhost) მუშაობს.
 *
 * phase: idle → outgoing (რეკავს) / incoming (ურეკავენ) → connecting (უპასუხეს, კავშირი მყარდება) → active → idle.
 */

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active";

export type CallState = {
  phase: CallPhase;
  callId: string | null;
  peer: UserRef | null;
  muted: boolean;
  /** საუბრის დაწყება (active) — ტაიმერისთვის */
  startedAt: number | null;
};

const IDLE: CallState = { phase: "idle", callId: null, peer: null, muted: false, startedAt: null };

/** პასუხის შემდეგ ხმის კავშირი ამ დროში უნდა დამყარდეს. */
const CONNECT_TIMEOUT_MS = 20_000;
const ACK_TIMEOUT_MS = 10_000;

const END_TEXT: Record<CallEndReason, string | null> = {
  declined: "ზარი უარყოფილია",
  missed: "არ უპასუხა",
  cancelled: null,
  ended: "ზარი დასრულდა",
  busy: "თანამშრომელი სხვა ზარშია",
  disconnected: "კავშირი გაწყდა — ზარი დასრულდა",
  elsewhere: null,
};

function microphoneError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "მიკროფონზე წვდომა არ არის — ბრაუზერის მისამართის ზოლში დაუშვით მიკროფონი";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "მიკროფონი ვერ მოიძებნა — შეაერთეთ მიკროფონი ან ყურსასმენი";
  if (name === "NotReadableError") return "მიკროფონი სხვა პროგრამას უკავია";
  return "მიკროფონი ვერ ჩაირთო";
}

export class CallController {
  readonly store = new Store<CallState>(IDLE);
  private socket: ChatSocket | null = null;
  private stream: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  /** ICE კანდიდატები remote description-მდე */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteAudio: HTMLAudioElement | null = null;
  private stopRing: (() => void) | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  private get state() {
    return this.store.getState();
  }

  private set(patch: Partial<CallState>) {
    this.store.set((s) => ({ ...s, ...patch }));
  }

  /** ზარი ახლა შესაძლებელია ამ ბრაუზერში (https / localhost, WebRTC). */
  static supported(): boolean {
    return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== "undefined";
  }

  /** ჩატის სოკეტთან მიბმა (ChatClient.start). აბრუნებს მოხსნას. */
  attach(socket: ChatSocket): () => void {
    this.socket = socket;
    const onIncoming: ServerToClientEvents["call:incoming"] = (e) => void this.incoming(e.callId, e.from);
    const onAccepted: ServerToClientEvents["call:accepted"] = (e) => e.callId === this.state.callId && void this.accepted();
    const onSignal: ServerToClientEvents["call:signal"] = (e) => e.callId === this.state.callId && void this.receiveSignal(e.signal);
    const onEnded: ServerToClientEvents["call:ended"] = (e) => e.callId === this.state.callId && this.ended(e.reason);
    // სოკეტი გაწყდა — სერვერი ზარს ასრულებს; აქაც ვასუფთავებთ
    const onDisconnect = () => this.state.phase !== "idle" && this.ended("disconnected");
    socket.on("call:incoming", onIncoming);
    socket.on("call:accepted", onAccepted);
    socket.on("call:signal", onSignal);
    socket.on("call:ended", onEnded);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:accepted", onAccepted);
      socket.off("call:signal", onSignal);
      socket.off("call:ended", onEnded);
      socket.off("disconnect", onDisconnect);
      this.cleanup();
      this.socket = null;
    };
  }

  // ─── მოქმედებები (ღილაკები) ───

  async call(peer: UserRef) {
    if (this.state.phase !== "idle") {
      toast.error("ზარი უკვე მიმდინარეობს");
      return;
    }
    if (!CallController.supported()) {
      toast.error("ზარისთვის საჭიროა უსაფრთხო კავშირი (https://) და თანამედროვე ბრაუზერი");
      return;
    }
    const socket = this.socket;
    if (!socket?.connected) {
      toast.error("კავშირი სერვერთან არ არის — სცადეთ ცოტა ხანში");
      return;
    }
    const callId = randomId();
    // ჯერ მდგომარეობა (ღილაკი მაშინვე „რეკავს“), შემდეგ მიკროფონი
    this.set({ ...IDLE, phase: "outgoing", callId, peer });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (error) {
      this.cleanup();
      toast.error(microphoneError(error));
      return;
    }
    if (this.state.callId !== callId) return this.releaseMedia(); // გაუქმდა ლოდინში
    const result = await this.ack((done) => socket.timeout(ACK_TIMEOUT_MS).emit("call:invite", { callId, toUserId: peer.id }, done));
    if (this.state.callId !== callId) {
      // ლოდინში გათიშა — სერვერზე უკვე შექმნილი ზარიც უქმდება
      if (result.ok) socket.emit("call:hangup", { callId });
      return;
    }
    if (!result.ok) {
      this.cleanup();
      toast.error(result.error);
      return;
    }
    this.stopRing = startRingtone("outgoing");
  }

  async accept() {
    const { callId, phase } = this.state;
    const socket = this.socket;
    if (phase !== "incoming" || !callId || !socket) return;
    this.stopRinging();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (error) {
      socket.emit("call:decline", { callId });
      this.cleanup();
      toast.error(microphoneError(error));
      return;
    }
    if (this.state.callId !== callId) return this.releaseMedia();
    const result = await this.ack((done) => socket.timeout(ACK_TIMEOUT_MS).emit("call:accept", { callId }, done));
    if (this.state.callId !== callId) return;
    if (!result.ok) {
      this.cleanup();
      toast.error(result.error);
      return;
    }
    this.set({ phase: "connecting" });
    // offer-ს დამრეკი აგზავნის — აქ მხოლოდ კავშირის მომზადება
    this.createPeer();
  }

  decline() {
    const { callId, phase } = this.state;
    if (phase !== "incoming" || !callId) return;
    this.socket?.emit("call:decline", { callId });
    this.cleanup();
  }

  hangup() {
    const { callId, phase } = this.state;
    if (phase === "idle" || !callId) return;
    if (phase === "incoming") return this.decline();
    this.socket?.emit("call:hangup", { callId });
    this.cleanup();
  }

  toggleMute() {
    const muted = !this.state.muted;
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.set({ muted });
  }

  // ─── სერვერის მოვლენები ───

  private async incoming(callId: string, from: UserRef) {
    // სერვერი დაკავებულს არ ურეკავს; ეს ტაბი მაინც თუ რამეშია — უგულებელყოფს (სხვა ტაბი უპასუხებს)
    if (this.state.phase !== "idle") return;
    this.set({ ...IDLE, phase: "incoming", callId, peer: from });
    // რამდენიმე ტაბი: ზარის ფანჯარა ყველგან, ხმა და შეტყობინება — ერთში
    if (!(await claimNotification(`call-${callId}`)) || this.state.callId !== callId) return;
    this.stopRing = startRingtone("incoming");
    if (document.visibilityState !== "visible") {
      showNotification(`📞 ${fullName(from)}`, "შემომავალი ზარი", `call-${callId}`, () => undefined);
    }
  }

  /** დამრეკი: უპასუხეს — offer. */
  private async accepted() {
    this.stopRinging();
    this.set({ phase: "connecting" });
    const pc = this.createPeer();
    try {
      await pc.setLocalDescription(await pc.createOffer());
      this.sendSignal({ type: "offer", sdp: pc.localDescription?.sdp ?? "" });
    } catch {
      this.fail("ხმის კავშირი ვერ მომზადდა");
    }
  }

  private async receiveSignal(signal: CallSignal) {
    const pc = this.pc;
    if (!pc) return;
    try {
      if (signal.type === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
        else this.pendingCandidates.push(signal.candidate);
        return;
      }
      await pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
      for (const c of this.pendingCandidates.splice(0)) await pc.addIceCandidate(c);
      if (signal.type === "offer") {
        await pc.setLocalDescription(await pc.createAnswer());
        this.sendSignal({ type: "answer", sdp: pc.localDescription?.sdp ?? "" });
      }
    } catch {
      this.fail("ხმის კავშირი ვერ დამყარდა");
    }
  }

  private ended(reason: CallEndReason) {
    const text = END_TEXT[reason];
    this.cleanup();
    if (text) toast(text);
  }

  // ─── WebRTC ───

  private createPeer(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream!);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const { candidate, sdpMid, sdpMLineIndex } = e.candidate.toJSON();
      if (candidate) this.sendSignal({ type: "candidate", candidate: { candidate, sdpMid: sdpMid ?? null, sdpMLineIndex: sdpMLineIndex ?? null } });
    };
    pc.ontrack = (e) => {
      this.remoteAudio ??= new Audio();
      this.remoteAudio.autoplay = true;
      this.remoteAudio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void this.remoteAudio.play().catch(() => null);
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === "connected" && this.state.phase !== "active") {
        this.clearConnectTimer();
        this.set({ phase: "active", startedAt: Date.now() });
      } else if (pc.connectionState === "failed") {
        this.fail("ხმის კავშირი ვერ დამყარდა — შეამოწმეთ ქსელი");
      }
    };
    this.connectTimer = setTimeout(() => this.state.phase === "connecting" && this.fail("ხმის კავშირი ვერ დამყარდა — შეამოწმეთ ქსელი"), CONNECT_TIMEOUT_MS);
    return pc;
  }

  private sendSignal(signal: CallSignal) {
    const callId = this.state.callId;
    if (callId) this.socket?.emit("call:signal", { callId, signal });
  }

  /** შეცდომა საუბრის დამყარებისას — ზარი სრულდება ორივე მხარეს. */
  private fail(message: string) {
    if (this.state.phase === "idle") return;
    this.hangup();
    toast.error(message);
  }

  private ack(send: (done: (err: Error | null, r: CallAck) => void) => void): Promise<CallAck> {
    return new Promise((resolve) => send((err, r) => resolve(err ? { ok: false, error: "სერვერი არ პასუხობს — სცადეთ თავიდან" } : r)));
  }

  private stopRinging() {
    this.stopRing?.();
    this.stopRing = null;
  }

  private clearConnectTimer() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private releaseMedia() {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }

  private cleanup() {
    this.stopRinging();
    this.clearConnectTimer();
    this.pc?.close();
    this.pc = null;
    this.pendingCandidates = [];
    this.releaseMedia();
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
    this.store.set(() => IDLE);
  }
}
