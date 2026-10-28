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
 * phase: idle → outgoing (ირეკება) / incoming (ურეკავენ) → connecting (უპასუხეს, კავშირი მყარდება) → active → idle.
 *
 * საიმედოობა:
 * - offer-ს მხოლოდ დამრეკი აგზავნის (glare არ არის); პასუხის გამცემი RTCPeerConnection-ს ქმნის პასუხამდე —
 *   ადრე მოსული სიგნალი არ იკარგება; სიგნალები მუშავდება რიგით (ერთდროული setRemoteDescription არ ხდება).
 * - ცალკეული ICE კანდიდატის შეცდომა (IPv6, ვირტუალური ქსელის ბარათი) ზარს აღარ წყვეტს.
 * - კავშირი ვერ დამყარდა / გაწყდა / ხმა არ მოდის → ICE restart (გზის ხელახლა ძებნა, MAX_RESTARTS-მდე), შემდეგ — გათიშვა.
 * - ბრაუზერმა ხმის დაკვრა დაბლოკა (autoplay) — ზარის ფანჯარაში ღილაკი „ხმის ჩართვა“, ან ეკრანზე პირველი დაჭერა.
 * - დიაგნოსტიკა: ბრაუზერის კონსოლში (F12) „[ზარი]“ ჩანაწერები.
 */

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active";

export type CallState = {
  phase: CallPhase;
  callId: string | null;
  peer: UserRef | null;
  muted: boolean;
  /** საუბრის დაწყება (active) — ტაიმერისთვის */
  startedAt: number | null;
  /** კავშირი აღდგება (ICE restart) */
  reconnecting: boolean;
  /** ბრაუზერმა თანამოსაუბრის ხმის დაკვრა დაბლოკა — საჭიროა დაჭერა */
  audioBlocked: boolean;
};

const IDLE: CallState = { phase: "idle", callId: null, peer: null, muted: false, startedAt: null, reconnecting: false, audioBlocked: false };

/** ერთი მცდელობა (პირველი ან ICE restart) — ამ დროში უნდა დამყარდეს. */
const ATTEMPT_TIMEOUT_MS = 12_000;
/** გზის ხელახლა ძებნა ერთ ზარზე მაქსიმუმ. */
const MAX_RESTARTS = 3;
/** „disconnected“ ხშირად თავისით გადის — ამდენ ხანს ველოდებით restart-მდე. */
const DISCONNECTED_GRACE_MS = 3_000;
/** ხმის შემოწმება: შემომავალი ბაიტები ამდენ ხანს თუ არ იზრდება — restart. */
const AUDIO_CHECK_MS = 2_000;
const AUDIO_STALL_MS = 5_000;
const ACK_TIMEOUT_MS = 10_000;
const MIC: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

const END_TEXT: Record<CallEndReason, string | null> = {
  declined: "ზარი უარყოფილია",
  missed: "არ უპასუხა",
  cancelled: null,
  ended: "ზარი დასრულდა",
  busy: "თანამშრომელი სხვა ზარშია",
  disconnected: "კავშირი გაწყდა — ზარი დასრულდა",
  elsewhere: null,
};

const log = (...args: unknown[]) => console.info("[ზარი]", ...args);

function microphoneError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "მიკროფონზე წვდომა არ არის — ბრაუზერის მისამართის ზოლში დაუშვით მიკროფონი";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "მიკროფონი ვერ მოიძებნა — შეაერთეთ მიკროფონი ან ყურსასმენი";
  if (name === "NotReadableError") return "მიკროფონი სხვა პროგრამას უკავია";
  return "მიკროფონი ვერ ჩაირთო";
}

/** კანდიდატის ტიპი და მისამართი ლოგისთვის: „host 10.1.10.23 udp“. */
function describeCandidate(candidate: string): string {
  const p = candidate.split(" ");
  return `${p[7] ?? "?"} ${p[4] ?? "?"} ${p[2] ?? ""}`.trim();
}

export class CallController {
  readonly store = new Store<CallState>(IDLE);
  private socket: ChatSocket | null = null;
  private stream: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  /** ზარის რომელ მხარეს ვართ — offer-ს და restart-ს დამრეკი აგზავნის */
  private isCaller = false;
  /** ICE კანდიდატები remote description-მდე */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  /** სიგნალები RTCPeerConnection-მდე (დაცვა თანმიმდევრობის დარღვევისგან) */
  private earlySignals: CallSignal[] = [];
  /** სიგნალების რიგი — ერთი მეორის მერე */
  private signalChain: Promise<void> = Promise.resolve();
  private remoteAudio: HTMLAudioElement | null = null;
  private stopRing: (() => void) | null = null;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private audioTimer: ReturnType<typeof setInterval> | null = null;
  private restarts = 0;
  private lastBytes = 0;
  private lastBytesAt = 0;
  private unlockAudio: (() => void) | null = null;

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
    const onSignal: ServerToClientEvents["call:signal"] = (e) => {
      if (e.callId !== this.state.callId) return;
      this.signalChain = this.signalChain.then(() => this.receiveSignal(e.signal));
    };
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
    // ჯერ მდგომარეობა (ღილაკი მაშინვე „ირეკება“), შემდეგ მიკროფონი
    this.set({ ...IDLE, phase: "outgoing", callId, peer });
    this.isCaller = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(MIC);
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
    log("ირეკება", fullName(peer));
    this.stopRing = startRingtone("outgoing");
  }

  async accept() {
    const { callId, phase } = this.state;
    const socket = this.socket;
    if (phase !== "incoming" || !callId || !socket) return;
    this.stopRinging();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(MIC);
    } catch (error) {
      socket.emit("call:decline", { callId });
      this.cleanup();
      toast.error(microphoneError(error));
      return;
    }
    if (this.state.callId !== callId) return this.releaseMedia();
    this.isCaller = false;
    this.set({ phase: "connecting" });
    // RTCPeerConnection — პასუხამდე: დამრეკის offer შეიძლება ძალიან სწრაფად მოვიდეს
    this.createPeer();
    const result = await this.ack((done) => socket.timeout(ACK_TIMEOUT_MS).emit("call:accept", { callId }, done));
    if (this.state.callId !== callId) return;
    if (!result.ok) {
      this.cleanup();
      toast.error(result.error);
      return;
    }
    log("უპასუხა — ველოდებით დამრეკის offer-ს");
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

  /** „ხმის ჩართვა“ — ბრაუზერმა დაკვრა დაბლოკა, მომხმარებლის დაჭერით ვცდით თავიდან. */
  resumeAudio() {
    void this.playRemote();
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
    this.createPeer();
    log("უპასუხეს — offer");
    await this.sendOffer(false);
  }

  private async sendOffer(iceRestart: boolean) {
    const pc = this.pc;
    if (!pc) return;
    try {
      await pc.setLocalDescription(await pc.createOffer({ iceRestart }));
      this.sendSignal({ type: "offer", sdp: pc.localDescription?.sdp ?? "" });
    } catch (error) {
      log("offer ვერ შეიქმნა", error);
      this.fail("ხმის კავშირი ვერ მომზადდა");
    }
  }

  private async receiveSignal(signal: CallSignal) {
    const pc = this.pc;
    if (!pc) {
      this.earlySignals.push(signal);
      return;
    }
    if (signal.type === "restart") {
      // მეორე მხარეს ხმა არ მოდის / კავშირი გაწყდა — გზას დამრეკი ეძებს ხელახლა
      if (this.isCaller) this.restart("მეორე მხარის მოთხოვნით");
      return;
    }
    if (signal.type === "candidate") {
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(signal.candidate);
        return;
      }
      await this.addCandidate(pc, signal.candidate);
      return;
    }
    try {
      await pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
      for (const c of this.pendingCandidates.splice(0)) await this.addCandidate(pc, c);
      if (signal.type === "offer") {
        await pc.setLocalDescription(await pc.createAnswer());
        this.sendSignal({ type: "answer", sdp: pc.localDescription?.sdp ?? "" });
      }
    } catch (error) {
      log(`${signal.type} ვერ დამუშავდა`, error);
      this.fail("ხმის კავშირი ვერ დამყარდა");
    }
  }

  /** ცალკეული კანდიდატის შეცდომა ზარს არ წყვეტს — დანარჩენი გზები მაინც მოწმდება. */
  private async addCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      log("კანდიდატი გამოტოვდა", describeCandidate(candidate.candidate ?? ""), error instanceof Error ? error.message : error);
    }
  }

  private ended(reason: CallEndReason) {
    const text = END_TEXT[reason];
    log("დასრულდა:", reason);
    this.cleanup();
    if (text) toast(text);
  }

  // ─── WebRTC ───

  private createPeer() {
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    this.restarts = 0;
    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream!);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const { candidate, sdpMid, sdpMLineIndex } = e.candidate.toJSON();
      if (!candidate) return;
      log("ჩემი კანდიდატი:", describeCandidate(candidate));
      this.sendSignal({ type: "candidate", candidate: { candidate, sdpMid: sdpMid ?? null, sdpMLineIndex: sdpMLineIndex ?? null } });
    };
    pc.ontrack = (e) => {
      if (!this.remoteAudio) {
        // DOM-ში (დამალული) — ზოგ ბრაუზერში DOM-ის გარეშე დაკვრა არასტაბილურია
        this.remoteAudio = document.createElement("audio");
        this.remoteAudio.autoplay = true;
        this.remoteAudio.hidden = true;
        document.body.append(this.remoteAudio);
      }
      this.remoteAudio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void this.playRemote();
    };
    pc.oniceconnectionstatechange = () => log("ICE:", pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const state = pc.connectionState;
      log("კავშირი:", state);
      if (state === "connected") {
        this.clearTimer("attempt");
        this.clearTimer("disconnect");
        void this.logSelectedPair(pc);
        if (this.state.phase !== "active") {
          this.set({ phase: "active", startedAt: Date.now(), reconnecting: false });
          this.startAudioWatch(pc);
        } else {
          this.set({ reconnecting: false });
        }
      } else if (state === "failed") {
        this.recover("კავშირი ვერ დამყარდა");
      } else if (state === "disconnected") {
        this.clearTimer("disconnect");
        this.disconnectTimer = setTimeout(() => pc.connectionState === "disconnected" && this.recover("კავშირი გაწყდა"), DISCONNECTED_GRACE_MS);
      }
    };
    this.armAttemptTimer();
    for (const s of this.earlySignals.splice(0)) this.signalChain = this.signalChain.then(() => this.receiveSignal(s));
  }

  /** ერთი მცდელობის ვადა — შემდეგ restart (ან გათიშვა, თუ მცდელობები ამოიწურა). */
  private armAttemptTimer() {
    this.clearTimer("attempt");
    this.attemptTimer = setTimeout(() => {
      if (this.state.phase === "connecting" || this.state.reconnecting) this.recover("კავშირი დიდხანს ვერ დამყარდა");
    }, ATTEMPT_TIMEOUT_MS);
  }

  /** კავშირის პრობლემა: დამრეკი თავად ეძებს გზას ხელახლა, პასუხის გამცემი სთხოვს დამრეკს. */
  private recover(why: string) {
    if (this.state.phase === "idle") return;
    if (this.restarts >= MAX_RESTARTS) {
      log(why, "— მცდელობები ამოიწურა");
      this.fail("ხმის კავშირი ვერ დამყარდა — შეამოწმეთ ქსელი");
      return;
    }
    if (this.isCaller) this.restart(why);
    else {
      this.restarts++;
      log(why, "— ვთხოვთ დამრეკს ხელახლა ცდას");
      this.set({ reconnecting: this.state.phase === "active" });
      this.sendSignal({ type: "restart" });
      this.armAttemptTimer();
    }
  }

  /** ICE restart: ახალი offer ახალი ICE პარამეტრებით — ბრაუზერი ყველა გზას თავიდან ამოწმებს. */
  private restart(why: string) {
    const pc = this.pc;
    if (!pc || this.state.phase === "idle") return;
    if (this.restarts >= MAX_RESTARTS) return this.recover(why);
    this.restarts++;
    log(`${why} — გზის ხელახლა ძებნა (${this.restarts}/${MAX_RESTARTS})`);
    this.set({ reconnecting: this.state.phase === "active" });
    this.lastBytesAt = Date.now();
    this.armAttemptTimer();
    void this.sendOffer(true);
  }

  /** ხმა მოდის? შემომავალი ბაიტები არ იზრდება — restart; ელემენტი გაჩერდა — დაკვრა თავიდან. */
  private startAudioWatch(pc: RTCPeerConnection) {
    this.clearTimer("audio");
    this.lastBytes = 0;
    this.lastBytesAt = Date.now();
    this.audioTimer = setInterval(async () => {
      if (this.pc !== pc || pc.connectionState !== "connected") return;
      let bytes = 0;
      try {
        (await pc.getStats()).forEach((r) => {
          if (r.type === "inbound-rtp" && r.kind === "audio") bytes += r.bytesReceived ?? 0;
        });
      } catch {
        return;
      }
      const now = Date.now();
      if (bytes > this.lastBytes) {
        this.lastBytes = bytes;
        this.lastBytesAt = now;
        if (this.remoteAudio?.paused && !this.state.audioBlocked) void this.playRemote();
      } else if (now - this.lastBytesAt > AUDIO_STALL_MS) {
        this.lastBytesAt = now;
        this.recover("თანამოსაუბრის ხმა არ მოდის");
      }
    }, AUDIO_CHECK_MS);
  }

  private async playRemote() {
    const audio = this.remoteAudio;
    if (!audio) return;
    try {
      await audio.play();
      if (this.state.audioBlocked) this.set({ audioBlocked: false });
      this.unlockAudio?.();
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotAllowedError" || this.remoteAudio !== audio) return;
      log("ბრაუზერმა ხმის დაკვრა დაბლოკა — საჭიროა დაჭერა");
      this.set({ audioBlocked: true });
      if (!this.unlockAudio) {
        // ეკრანზე ნებისმიერი დაჭერა/კლავიში — ხმა ირთვება
        const retry = () => void this.playRemote();
        window.addEventListener("pointerdown", retry, true);
        window.addEventListener("keydown", retry, true);
        this.unlockAudio = () => {
          window.removeEventListener("pointerdown", retry, true);
          window.removeEventListener("keydown", retry, true);
          this.unlockAudio = null;
        };
      }
    }
  }

  private async logSelectedPair(pc: RTCPeerConnection) {
    try {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type !== "candidate-pair" || !r.nominated || r.state !== "succeeded") return;
        const local = stats.get(r.localCandidateId);
        const remote = stats.get(r.remoteCandidateId);
        log("გზა:", `${local?.candidateType} ${local?.address}:${local?.port}`, "→", `${remote?.candidateType} ${remote?.address}:${remote?.port}`, local?.protocol);
      });
    } catch {
      // მხოლოდ დიაგნოსტიკა
    }
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

  private clearTimer(which: "attempt" | "disconnect" | "audio") {
    if (which === "attempt" && this.attemptTimer) clearTimeout(this.attemptTimer);
    if (which === "disconnect" && this.disconnectTimer) clearTimeout(this.disconnectTimer);
    if (which === "audio" && this.audioTimer) clearInterval(this.audioTimer);
    if (which === "attempt") this.attemptTimer = null;
    if (which === "disconnect") this.disconnectTimer = null;
    if (which === "audio") this.audioTimer = null;
  }

  private releaseMedia() {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }

  private cleanup() {
    this.stopRinging();
    this.clearTimer("attempt");
    this.clearTimer("disconnect");
    this.clearTimer("audio");
    this.unlockAudio?.();
    this.pc?.close();
    this.pc = null;
    this.pendingCandidates = [];
    this.earlySignals = [];
    this.signalChain = Promise.resolve();
    this.restarts = 0;
    this.releaseMedia();
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio.remove();
      this.remoteAudio = null;
    }
    this.store.set(() => IDLE);
  }
}
