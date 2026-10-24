import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { randomId } from "@/lib/browser-compat";
import { CHAT_SOCKET_PATH, MESSAGE_PAGE_SIZE, QUOTE_LENGTH, TYPING_SEND_MS, TYPING_SHOW_MS } from "@/modules/chat/config";
import { fullName, previewText, snippet } from "@/modules/chat/format";
import { idleMs, trackActivity } from "@/modules/chat/client/activity";
import { ChatApiError, chatApi } from "@/modules/chat/client/api";
import {
  type ChatState,
  emptyMessages,
  initialState,
  mergeMessages,
  type MessagesState,
  sortConversations,
  Store,
  type UiMessage,
} from "@/modules/chat/client/store";
import type {
  ChatContact,
  ChatMessage,
  ClientToServerEvents,
  ConversationDetail,
  ConversationSummary,
  ManualStatus,
  Presence,
  PresenceUpdate,
  ServerToClientEvents,
  UserRef,
} from "@/modules/chat/types";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** სერვერმა კავშირი გაწყვიტა (სესიის ვადა): ხელახლა ცდა ამდენ ხანში (cookie შეიძლება უკვე განახლდა). */
const SERVER_DISCONNECT_RETRY_MS = 3_000;
/** წაკითხვის მონიშვნა სერვერზე — მაქსიმუმ ერთხელ ამ დროში საუბარზე. */
const READ_DEBOUNCE_MS = 400;

export type MessageListener = (message: ChatMessage, conversation: ConversationSummary | undefined) => void;

const errorText = (error: unknown) => (error instanceof ChatApiError ? error.message : "შეცდომა, სცადეთ თავიდან");

function lastMessageOf(m: ChatMessage) {
  const senderName = fullName(m.sender);
  return {
    id: m.id,
    senderId: m.sender.id,
    senderName,
    text: previewText({
      kind: m.kind,
      body: m.body,
      deleted: m.deleted,
      event: m.event,
      actorName: senderName,
      targetName: m.target ? fullName(m.target) : null,
      attachments: m.attachments.length,
    }),
    at: m.createdAt,
  };
}

/**
 * ჩატის კლიენტი: ერთი ტაბზე (ChatProvider). ფლობს store-ს და Socket.IO კავშირს; ყველა მოქმედება აქ არის —
 * სრული გვერდი და popup ერთსა და იმავე მეთოდებს იძახებენ.
 */
export class ChatClient {
  readonly store: Store<ChatState>;
  private socket: ChatSocket | null = null;
  private stopActivity: (() => void) | null = null;
  private typingSweep: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionEnded = false;
  /** საუბარი → რამდენი ხილული ხედი „კითხულობს“ (ბოლოშია, ტაბი აქტიურია) */
  private readers = new Map<number, number>();
  private readTimers = new Map<number, ReturnType<typeof setTimeout>>();
  /** debounce-ის მოლოდინში მყოფი წაკითხვები (გვერდის დატოვებისას მაშინვე იგზავნება) */
  private pendingReads = new Map<number, () => void>();
  private typingSentAt = new Map<number, number>();
  private pendingSeq = 0;
  private messageListeners = new Set<MessageListener>();
  private refreshing = new Map<number, Promise<void>>();
  /** clientId → ატვირთვის ფაილები (ხელახლა ცდისთვის; store-ში მხოლოდ preview) */
  private outgoingFiles = new Map<string, File[]>();

  constructor(me: UserRef) {
    this.store = new Store(initialState(me));
  }

  private get state() {
    return this.store.getState();
  }

  private get meId() {
    return this.state.me.id;
  }

  // ─── სასიცოცხლო ციკლი ───

  /** კავშირი, საწყისი მონაცემები, აქტივობის თვალყური. აბრუნებს გამორთვის ფუნქციას (layout-ის unmount). */
  start(): () => void {
    const socket: ChatSocket = io({
      path: CHAT_SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      // ხელახლა დაკავშირებისას — ბოლო აქტივობიდან გასული დრო (ფონური ტაბი „აქტიურად“ არ ჩანს)
      auth: (cb) => cb({ idleMs: idleMs() }),
    });
    this.socket = socket;
    this.bindSocket(socket);
    this.stopActivity = trackActivity(() => socket.connected && socket.emit("activity"));
    this.typingSweep = setInterval(() => this.sweepTyping(), 1_000);
    const flushReads = () => this.flushReads();
    window.addEventListener("pagehide", flushReads);

    void this.loadConversations();
    void this.loadFavorites();
    void chatApi
      .settings()
      .then((r) => this.setState((s) => ({ ...s, settings: r.settings })))
      .catch(() => null);
    void chatApi
      .presence()
      .then((r) => this.setState((s) => ({ ...s, manualStatus: r.manualStatus })))
      .catch(() => null);

    return () => {
      window.removeEventListener("pagehide", flushReads);
      this.flushReads();
      this.stopActivity?.();
      if (this.typingSweep) clearInterval(this.typingSweep);
      if (this.retryTimer) clearTimeout(this.retryTimer);
      socket.removeAllListeners();
      socket.disconnect();
      this.socket = null;
    };
  }

  private setState(update: (s: ChatState) => ChatState) {
    this.store.set(update);
  }

  private bindSocket(socket: ChatSocket) {
    socket.on("connect", () => {
      const reconnected = this.state.everConnected;
      this.setState((s) => ({ ...s, connection: "connected", everConnected: true }));
      if (reconnected) void this.resync();
    });
    socket.on("disconnect", (reason) => {
      if (this.sessionEnded) return;
      this.setState((s) => ({ ...s, connection: "reconnecting" }));
      // სერვერის ინიციატივით გაწყვეტისას Socket.IO თავად აღარ ცდის — ვცდით ჩვენ
      if (reason === "io server disconnect") {
        this.retryTimer = setTimeout(() => socket.connect(), SERVER_DISCONNECT_RETRY_MS);
      }
    });
    socket.on("connect_error", (error) => {
      if (error.message === "unauthorized") {
        // სესია აღარ არის (ვადა, გასვლა, გათიშვა) — ხელახლა ცდას აზრი არ აქვს
        this.setState((s) => ({ ...s, connection: "unauthorized" }));
        socket.disconnect();
        return;
      }
      this.setState((s) => ({ ...s, connection: s.everConnected ? "reconnecting" : "connecting" }));
    });
    socket.on("session:ended", ({ reason }) => {
      // გასვლა: ეს ტაბი /login-ზე გადადის; სხვა ტაბები ხელახლა დაკავშირებას ცდიან —
      // სესია აღარ არის → „სესია დასრულდა“, სხვა ანგარიშით შევიდნენ → session:user → განახლება
      if (reason === "deactivated") {
        this.sessionEnded = true;
        this.setState((s) => ({ ...s, connection: "unauthorized" }));
      }
    });

    socket.on("session:user", ({ userId }) => {
      if (userId !== this.meId) this.sessionChanged();
    });

    socket.on("message:new", (m) => this.receiveMessage(m));
    socket.on("message:updated", (m) => this.receiveUpdate(m));
    socket.on("conversation:read", (e) => this.receiveRead(e.conversationId, e.userId, e.lastReadMessageId));
    socket.on("conversation:changed", ({ conversationId }) => void this.refreshConversation(conversationId));
    socket.on("conversation:removed", ({ conversationId }) => this.dropConversation(conversationId));
    socket.on("history:purged", () => void this.reloadAfterPurge());
    socket.on("typing", ({ conversationId, userId }) => {
      if (userId === this.meId) return;
      this.setState((s) => ({
        ...s,
        typing: { ...s.typing, [conversationId]: { ...s.typing[conversationId], [userId]: Date.now() + TYPING_SHOW_MS } },
      }));
    });
    socket.on("presence", (p) => this.applyPresence([p]));
    socket.on("presence:snapshot", (list) => this.applySnapshot(list));
  }

  /**
   * ამ ბრაუზერში სხვა ანგარიშით შევიდნენ (სხვა ტაბში): cookie უკვე სხვისია, ეს ტაბი კი ძველ მომხმარებელს აჩვენებს.
   * გვერდი თავიდან იტვირთება — სწორი მომხმარებლით (ან შესვლის გვერდით).
   */
  private reloading = false;

  private sessionChanged() {
    if (this.reloading) return;
    this.reloading = true;
    this.sessionEnded = true;
    this.socket?.disconnect();
    window.location.reload();
  }

  /** ხელახლა დაკავშირების შემდეგ: სია, Favorites, ღია საუბრების ბოლო შეტყობინებები (გამოტოვებული და შეცვლილი). */
  private async resync() {
    await Promise.all([this.loadConversations(), this.loadFavorites()]);
    const loaded = Object.entries(this.state.messages).filter(([, m]) => m.status === "ready" && !m.hasMoreAfter);
    await Promise.all(
      loaded.map(async ([key, m]) => {
        const id = Number(key);
        try {
          const page = await chatApi.messages(id, { limit: MESSAGE_PAGE_SIZE });
          const lastLocal = m.items.at(-1)?.id ?? 0;
          // ბოლო გვერდზე ადრე არის ჩვენზე ახალი შეტყობინება, რომელიც არ ვიცით — ხვრელი: იწყება ბოლო გვერდიდან
          const gap = page.hasMoreBefore && (page.messages[0]?.id ?? 0) > lastLocal + 1 && lastLocal > 0;
          this.updateMessages(id, (cur) =>
            gap
              ? { ...cur, items: page.messages, hasMoreBefore: true, firstUnreadId: null }
              : { ...cur, items: mergeMessages(cur.items, page.messages) },
          );
        } catch {
          // შემდეგ ხელახლა დაკავშირებაზე
        }
      }),
    );
    await Promise.all(Object.keys(this.state.details).map((id) => this.refreshConversation(Number(id))));
  }

  /** ისტორია გასუფთავდა: სია და ჩატვირთული საუბრების ბოლო გვერდი თავიდან (ძველი შეტყობინებები ქრება, არა ერწყმის). */
  private async reloadAfterPurge() {
    await this.loadConversations();
    await Promise.all(
      Object.keys(this.state.messages).map(async (key) => {
        const id = Number(key);
        try {
          const page = await chatApi.messages(id, { limit: MESSAGE_PAGE_SIZE });
          this.updateMessages(id, (cur) => ({
            ...cur,
            status: "ready",
            error: null,
            items: page.messages,
            hasMoreBefore: page.hasMoreBefore,
            hasMoreAfter: false,
            firstUnreadId: null,
          }));
        } catch (error) {
          this.updateMessages(id, (cur) => ({ ...cur, status: "error", error: errorText(error) }));
        }
      }),
    );
  }

  // ─── მონაცემები ───

  async loadConversations() {
    try {
      const { conversations } = await chatApi.conversations();
      const map = Object.fromEntries(conversations.map((c) => [c.id, c]));
      this.seedPresence(conversations.flatMap((c) => (c.peer ? [[c.peer.id, c.peer.presence] as const] : [])));
      this.setState((s) => ({ ...s, conversationsStatus: "ready", conversations: map, order: sortConversations(map) }));
    } catch {
      this.setState((s) => ({ ...s, conversationsStatus: s.conversationsStatus === "ready" ? "ready" : "error" }));
    }
  }

  async loadFavorites() {
    try {
      const { users } = await chatApi.favorites();
      this.seedPresence(users.map((u) => [u.id, u.presence] as const));
      this.setState((s) => ({ ...s, favorites: users }));
    } catch {
      // სია ცარიელი რჩება; შემდეგ ცდაზე
    }
  }

  /** ერთი საუბრის (სია + მონაწილეები) განახლება სერვერიდან; ერთდროული მოთხოვნები ერთიანდება. */
  refreshConversation(id: number): Promise<void> {
    const running = this.refreshing.get(id);
    if (running) return running;
    const task = chatApi
      .conversation(id)
      .then(({ conversation }) => this.upsertDetail(conversation))
      .catch((error) => {
        if (error instanceof ChatApiError && error.status === 404) this.dropConversation(id);
      })
      .finally(() => this.refreshing.delete(id));
    this.refreshing.set(id, task);
    return task;
  }

  private upsertDetail(detail: ConversationDetail) {
    const { members, ...summary } = detail;
    this.seedPresence(members.map((m) => [m.id, m.presence] as const), true);
    this.setState((s) => {
      const conversations = { ...s.conversations, [summary.id]: summary };
      return { ...s, conversations, order: sortConversations(conversations), details: { ...s.details, [detail.id]: detail } };
    });
  }

  private dropConversation(id: number) {
    this.setState((s) => {
      if (!s.conversations[id] && !s.details[id] && !s.messages[id]) return s;
      const conversations = { ...s.conversations };
      delete conversations[id];
      const details = { ...s.details };
      delete details[id];
      const messages = { ...s.messages };
      delete messages[id];
      return {
        ...s,
        conversations,
        details,
        messages,
        order: sortConversations(conversations),
        popup: s.popup.conversationId === id ? { ...s.popup, conversationId: null } : s.popup,
      };
    });
  }

  private updateMessages(id: number, update: (m: MessagesState) => MessagesState) {
    this.setState((s) => {
      const current = s.messages[id];
      if (!current) return s;
      return { ...s, messages: { ...s.messages, [id]: update(current) } };
    });
  }

  private updateSummary(id: number, update: (c: ConversationSummary) => ConversationSummary) {
    this.setState((s) => {
      const current = s.conversations[id];
      if (!current) return s;
      const conversations = { ...s.conversations, [id]: update(current) };
      return { ...s, conversations, order: sortConversations(conversations) };
    });
  }

  /**
   * საუბრის გახსნა: მონაწილეები და ისტორია. წაუკითხავები თუ არის — ჩაიტვირთება ბოლო წაკითხულის ირგვლივ
   * და ჩანს „ახალი შეტყობინებები“ ზოლი; სხვაგვარად — ბოლო გვერდი.
   */
  async openConversation(id: number) {
    void this.refreshConversation(id);
    const summary = this.state.conversations[id];
    const cached = this.state.messages[id];
    const unreadFrom = summary && summary.unread > 0 ? summary.lastReadMessageId : null;

    if (cached?.status === "ready" && !cached.hasMoreAfter) {
      this.updateMessages(id, (m) => ({
        ...m,
        firstUnreadId: unreadFrom !== null ? this.firstUnreadIn(m.items, unreadFrom) : null,
        focus: { id: unreadFrom !== null ? "unread" : "bottom", seq: (m.focus?.seq ?? 0) + 1 },
      }));
      // გამოტოვებული (თუ კავშირი იყო გაწყვეტილი) — ბოლო გვერდით
      const lastId = cached.items.at(-1)?.id;
      if (lastId && summary?.lastMessage && summary.lastMessage.id > lastId) await this.loadNewer(id, true);
      return;
    }

    this.setState((s) => ({ ...s, messages: { ...s.messages, [id]: { ...emptyMessages(), pending: cached?.pending ?? [] } } }));
    try {
      const page =
        unreadFrom && unreadFrom > 0 ? await chatApi.messages(id, { around: unreadFrom }) : await chatApi.messages(id);
      this.updateMessages(id, (m) => ({
        ...m,
        status: "ready",
        items: page.messages,
        hasMoreBefore: page.hasMoreBefore,
        hasMoreAfter: page.hasMoreAfter,
        firstUnreadId: unreadFrom !== null ? this.firstUnreadIn(page.messages, unreadFrom) : null,
        focus: { id: unreadFrom !== null ? "unread" : "bottom", seq: 1 },
      }));
    } catch (error) {
      this.updateMessages(id, (m) => ({ ...m, status: "error", error: errorText(error) }));
    }
  }

  private firstUnreadIn(items: ChatMessage[], lastReadId: number): number | null {
    return items.find((m) => m.id > lastReadId && m.sender.id !== this.meId)?.id ?? null;
  }

  /** უფრო ძველი შეტყობინებები (ზემოთ სქროლვა). */
  async loadOlder(id: number) {
    const m = this.state.messages[id];
    if (!m || m.status !== "ready" || !m.hasMoreBefore || m.loadingOlder || m.items.length === 0) return;
    this.updateMessages(id, (cur) => ({ ...cur, loadingOlder: true }));
    try {
      const page = await chatApi.messages(id, { before: m.items[0].id });
      this.updateMessages(id, (cur) => ({
        ...cur,
        loadingOlder: false,
        items: mergeMessages(cur.items, page.messages),
        hasMoreBefore: page.hasMoreBefore,
      }));
    } catch (error) {
      this.updateMessages(id, (cur) => ({ ...cur, loadingOlder: false }));
      toast.error(errorText(error));
    }
  }

  /** უფრო ახალი (ძველი ნაწილიდან ქვემოთ სქროლვა); force — ბოლო გვერდამდე. */
  async loadNewer(id: number, force = false) {
    const m = this.state.messages[id];
    if (!m || m.status !== "ready" || (!m.hasMoreAfter && !force) || m.loadingNewer) return;
    const lastId = m.items.at(-1)?.id;
    if (!lastId) return;
    this.updateMessages(id, (cur) => ({ ...cur, loadingNewer: true }));
    try {
      const page = await chatApi.messages(id, { after: lastId });
      this.updateMessages(id, (cur) => ({
        ...cur,
        loadingNewer: false,
        items: mergeMessages(cur.items, page.messages),
        hasMoreAfter: page.hasMoreAfter,
      }));
    } catch (error) {
      this.updateMessages(id, (cur) => ({ ...cur, loadingNewer: false }));
      toast.error(errorText(error));
    }
  }

  /** კონკრეტულ შეტყობინებაზე გადასვლა (ძებნის შედეგი, ციტატა). */
  async jumpTo(id: number, messageId: number) {
    const m = this.state.messages[id];
    if (m?.items.some((x) => x.id === messageId)) {
      this.updateMessages(id, (cur) => ({ ...cur, focus: { id: messageId, seq: (cur.focus?.seq ?? 0) + 1 } }));
      return;
    }
    try {
      const page = await chatApi.messages(id, { around: messageId });
      this.updateMessages(id, (cur) => ({
        ...cur,
        status: "ready",
        items: page.messages,
        hasMoreBefore: page.hasMoreBefore,
        hasMoreAfter: page.hasMoreAfter,
        firstUnreadId: null,
        focus: { id: messageId, seq: (cur.focus?.seq ?? 0) + 1 },
      }));
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  /** ბოლოში ჩასვლა: ძველ ნაწილში ყოფნისას — ბოლო გვერდი თავიდან. */
  async jumpToLatest(id: number) {
    const m = this.state.messages[id];
    if (!m) return;
    if (!m.hasMoreAfter) {
      this.updateMessages(id, (cur) => ({ ...cur, focus: { id: "bottom", seq: (cur.focus?.seq ?? 0) + 1 } }));
      return;
    }
    try {
      const page = await chatApi.messages(id);
      this.updateMessages(id, (cur) => ({
        ...cur,
        items: page.messages,
        hasMoreBefore: page.hasMoreBefore,
        hasMoreAfter: false,
        focus: { id: "bottom", seq: (cur.focus?.seq ?? 0) + 1 },
      }));
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  searchMessages(id: number, q: string, before?: number) {
    return chatApi.searchMessages(id, q, before);
  }

  async searchUsers(q: string): Promise<ChatContact[]> {
    const { users } = await chatApi.searchUsers(q);
    this.seedPresence(users.map((u) => [u.id, u.presence] as const));
    return users;
  }

  // ─── სოკეტის მოვლენები ───

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private receiveMessage(m: ChatMessage) {
    const mine = m.sender.id === this.meId;
    const conversationId = m.conversationId;
    const reading = this.isReading(conversationId);
    if (mine && m.clientId) {
      const own = this.state.messages[conversationId]?.pending.find((p) => p.clientId === m.clientId);
      if (own) this.releasePreviews(own);
      this.outgoingFiles.delete(m.clientId);
    }

    this.updateMessages(conversationId, (cur) => ({
      ...cur,
      // ძველ ნაწილში ყოფნისას ბოლოში არ ვამატებთ (ხვრელი იქნებოდა) — ჩაიტვირთება ქვემოთ სქროლვისას
      items: cur.hasMoreAfter ? cur.items : mergeMessages(cur.items, [m]),
      pending: mine && m.clientId ? cur.pending.filter((p) => p.clientId !== m.clientId) : cur.pending,
    }));

    const summary = this.state.conversations[conversationId];
    if (!summary) {
      void this.refreshConversation(conversationId);
    } else if (!summary.lastMessage || summary.lastMessage.id <= m.id) {
      this.updateSummary(conversationId, (c) => ({
        ...c,
        lastMessage: lastMessageOf(m),
        activityAt: m.createdAt,
        // საკუთარი შეტყობინება = წინა ყველა წაკითხულია (სერვერიც ასე ითვლის)
        unread: mine ? 0 : reading || m.id <= c.lastReadMessageId ? c.unread : c.unread + 1,
        lastReadMessageId: mine ? Math.max(c.lastReadMessageId, m.id) : c.lastReadMessageId,
      }));
    }

    // ავტორი აღარ „წერს“
    if (this.state.typing[conversationId]?.[m.sender.id]) {
      this.setState((s) => {
        const t = { ...s.typing[conversationId] };
        delete t[m.sender.id];
        return { ...s, typing: { ...s.typing, [conversationId]: t } };
      });
    }
    if (m.kind === "system") void this.refreshConversation(conversationId);
    if (!mine && reading) this.markReadSoon(conversationId);
    if (!mine) for (const l of this.messageListeners) l(m, this.state.conversations[conversationId]);
  }

  /** რედაქტირება/წაშლა: შეტყობინება, ციტატები და სიის ნაწყვეტი. */
  private receiveUpdate(m: ChatMessage) {
    this.updateMessages(m.conversationId, (cur) => ({
      ...cur,
      items: cur.items.map((x) => {
        if (x.id === m.id) return m;
        if (x.replyTo?.id === m.id) {
          return { ...x, replyTo: { ...x.replyTo, text: m.deleted ? "" : snippet(m.body ?? "", QUOTE_LENGTH), deleted: m.deleted } };
        }
        return x;
      }),
    }));
    const summary = this.state.conversations[m.conversationId];
    if (summary?.lastMessage?.id === m.id) {
      this.updateSummary(m.conversationId, (c) => ({ ...c, lastMessage: { ...lastMessageOf(m), at: c.lastMessage!.at } }));
    }
  }

  private receiveRead(conversationId: number, userId: number, lastReadMessageId: number) {
    if (userId === this.meId) {
      // სხვა ტაბში წავიკითხე
      const c = this.state.conversations[conversationId];
      if (!c || lastReadMessageId <= c.lastReadMessageId) return;
      if (c.lastMessage && lastReadMessageId >= c.lastMessage.id) {
        this.updateSummary(conversationId, (x) => ({ ...x, unread: 0, lastReadMessageId }));
      } else {
        void this.refreshConversation(conversationId);
      }
      return;
    }
    this.setState((s) => {
      const d = s.details[conversationId];
      if (!d) return s;
      const members = d.members.map((m) =>
        m.id === userId ? { ...m, lastReadMessageId: Math.max(m.lastReadMessageId, lastReadMessageId) } : m,
      );
      return { ...s, details: { ...s.details, [conversationId]: { ...d, members } } };
    });
  }

  // ─── სტატუსები ───

  private applyPresence(list: PresenceUpdate[]) {
    if (list.length === 0) return;
    this.setState((s) => {
      const presence = { ...s.presence };
      for (const p of list) presence[p.userId] = { status: p.status, lastSeenAt: p.lastSeenAt ?? presence[p.userId]?.lastSeenAt ?? null };
      return { ...s, presence };
    });
  }

  /** სრული სია დაკავშირებისას: ვინც სიაში არ არის — გასულია (ბოლოს ყოფნის დრო რჩება). */
  private applySnapshot(list: PresenceUpdate[]) {
    this.setState((s) => {
      const presence: Record<number, Presence> = {};
      for (const [id, p] of Object.entries(s.presence)) presence[Number(id)] = { status: "offline", lastSeenAt: p.lastSeenAt };
      for (const p of list) presence[p.userId] = { status: p.status, lastSeenAt: null };
      return { ...s, presence };
    });
  }

  /**
   * API-ს მონაცემებიდან (ძებნა, სია, მონაწილეები): ცოცხალი მოვლენები უფრო ახალია, ამიტომ ცნობილი სტატუსი არ იცვლება —
   * ემატება მხოლოდ უცნობი და „ბოლოს იყო“. force — სერვერის ახლანდელი პასუხი (საუბრის გახსნა).
   */
  private seedPresence(entries: (readonly [number, Presence])[], force = false) {
    if (entries.length === 0) return;
    this.setState((s) => {
      let changed = false;
      const presence = { ...s.presence };
      for (const [id, p] of entries) {
        const cur = presence[id];
        if (!cur || force) {
          presence[id] = p;
          changed = true;
        } else if (cur.status === "offline" && !cur.lastSeenAt && p.lastSeenAt) {
          presence[id] = { ...cur, lastSeenAt: p.lastSeenAt };
          changed = true;
        }
      }
      return changed ? { ...s, presence } : s;
    });
  }

  async setDoNotDisturb(on: boolean) {
    const manualStatus: ManualStatus = on ? "dnd" : null;
    const previous = this.state.manualStatus;
    this.setState((s) => ({ ...s, manualStatus }));
    try {
      await chatApi.setManualStatus(manualStatus);
    } catch (error) {
      this.setState((s) => ({ ...s, manualStatus: previous }));
      toast.error(errorText(error));
    }
  }

  // ─── წაკითხვა და „წერს...“ ───

  /** ხედი აცნობებს: საუბარი ჩანს, ბოლოშია და ტაბი აქტიურია (reading) ან აღარ (false). */
  setReading(id: number, reading: boolean) {
    const n = (this.readers.get(id) ?? 0) + (reading ? 1 : -1);
    if (n > 0) this.readers.set(id, n);
    else this.readers.delete(id);
    if (reading) this.markReadSoon(id);
  }

  /** საუბარს ახლა კითხულობს (ჩანს, ბოლოშია, ტაბი აქტიურია) — შეტყობინება ხმის/notification-ის გარეშე. */
  isReading(id: number) {
    return (this.readers.get(id) ?? 0) > 0;
  }

  /** ბოლო ჩატვირთული შეტყობინებამდე წაკითხულია: მაშინვე ლოკალურად, სერვერზე — debounce-ით. */
  markReadSoon(id: number) {
    const c = this.state.conversations[id];
    const m = this.state.messages[id];
    const lastLoaded = m?.items.at(-1)?.id ?? 0;
    const target = m?.hasMoreAfter ? lastLoaded : Math.max(lastLoaded, c?.lastMessage?.id ?? 0);
    if (!c || target <= c.lastReadMessageId) return;
    const all = !m?.hasMoreAfter && target >= (c.lastMessage?.id ?? 0);
    this.updateSummary(id, (x) => ({ ...x, lastReadMessageId: target, unread: all ? 0 : x.unread }));

    const send = () => {
      clearTimeout(this.readTimers.get(id));
      this.readTimers.delete(id);
      this.pendingReads.delete(id);
      chatApi
        .markRead(id, target)
        .then(() => {
          if (!all) void this.refreshConversation(id);
        })
        .catch(() => null);
    };
    clearTimeout(this.readTimers.get(id));
    this.pendingReads.set(id, send);
    this.readTimers.set(id, setTimeout(send, READ_DEBOUNCE_MS));
  }

  /** debounce-ის მოლოდინში მყოფი წაკითხვები — ახლავე (გვერდის დატოვება / გადატვირთვა). */
  private flushReads() {
    for (const send of [...this.pendingReads.values()]) send();
  }

  /** „წერს...“ — მაქსიმუმ ერთხელ TYPING_SEND_MS-ში. */
  typing(id: number) {
    const now = Date.now();
    if (now - (this.typingSentAt.get(id) ?? 0) < TYPING_SEND_MS) return;
    this.typingSentAt.set(id, now);
    if (this.socket?.connected) this.socket.emit("typing", { conversationId: id });
  }

  private sweepTyping() {
    const now = Date.now();
    const s = this.state;
    let changed = false;
    const typing: ChatState["typing"] = {};
    for (const [cid, users] of Object.entries(s.typing)) {
      const alive = Object.fromEntries(Object.entries(users).filter(([, until]) => until > now));
      if (Object.keys(alive).length !== Object.keys(users).length) changed = true;
      if (Object.keys(alive).length) typing[Number(cid)] = alive;
    }
    if (changed) this.setState((st) => ({ ...st, typing }));
  }

  // ─── შეტყობინებები ───

  /** გაგზავნა optimistic UI-ით: მაშინვე ჩანს, შეცდომისას — „ხელახლა ცდა“. */
  async send(id: number, body: string, replyTo: ChatMessage | null, files: File[] = []) {
    const m = this.state.messages[id];
    if (m?.hasMoreAfter) await this.jumpToLatest(id);
    const clientId = randomId();
    const optimistic: UiMessage = {
      id: -++this.pendingSeq,
      conversationId: id,
      kind: "text",
      sender: this.state.me,
      body,
      event: null,
      target: null,
      replyTo: replyTo
        ? { id: replyTo.id, sender: replyTo.sender, text: snippet(replyTo.body ?? "", QUOTE_LENGTH), deleted: replyTo.deleted, hasAttachments: replyTo.attachments.length > 0 }
        : null,
      attachments: files.map((f, i) => ({
        id: -(i + 1),
        fileName: f.name,
        mimeType: f.type,
        size: f.size,
        width: null,
        height: null,
        localUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      })),
      clientId,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deleted: false,
      pending: "sending",
    };
    if (files.length) this.outgoingFiles.set(clientId, files);
    this.updateMessages(id, (cur) => ({ ...cur, pending: [...cur.pending, optimistic], focus: { id: "bottom", seq: (cur.focus?.seq ?? 0) + 1 } }));
    await this.deliver(id, optimistic);
  }

  /** ვერ გაგზავნილის ხელახლა ცდა (იგივე clientId — სერვერზე დუბლიკატი არ შეიქმნება). */
  async retry(id: number, clientId: string) {
    const p = this.state.messages[id]?.pending.find((x) => x.clientId === clientId);
    if (!p) return;
    this.updateMessages(id, (cur) => ({
      ...cur,
      pending: cur.pending.map((x) => (x.clientId === clientId ? { ...x, pending: "sending", error: undefined } : x)),
    }));
    await this.deliver(id, p);
  }

  discard(id: number, clientId: string) {
    const p = this.state.messages[id]?.pending.find((x) => x.clientId === clientId);
    if (p) this.releasePreviews(p);
    this.outgoingFiles.delete(clientId);
    this.updateMessages(id, (cur) => ({ ...cur, pending: cur.pending.filter((x) => x.clientId !== clientId) }));
  }

  private releasePreviews(p: UiMessage) {
    for (const a of p.attachments) if (a.localUrl) URL.revokeObjectURL(a.localUrl);
  }

  private async deliver(id: number, p: UiMessage) {
    try {
      const files = this.outgoingFiles.get(p.clientId!);
      const input = { body: p.body ?? "", replyToId: p.replyTo?.id, clientId: p.clientId! };
      const { message } = files?.length ? await chatApi.sendWithFiles(id, { ...input, files }) : await chatApi.send(id, input);
      this.outgoingFiles.delete(p.clientId!);
      this.releasePreviews(p);
      // optimistic ასლი იშლება ყოველთვის (სოკეტის მოვლენის მიუხედავად)
      this.updateMessages(id, (cur) => ({ ...cur, pending: cur.pending.filter((x) => x.clientId !== p.clientId) }));
      if (message.sender.id !== this.meId) return this.sessionChanged();
      this.receiveMessage(message);
    } catch (error) {
      this.updateMessages(id, (cur) => ({
        ...cur,
        pending: cur.pending.map((x) => (x.clientId === p.clientId ? { ...x, pending: "failed", error: errorText(error) } : x)),
      }));
    }
  }

  async edit(messageId: number, body: string): Promise<boolean> {
    try {
      const { message } = await chatApi.edit(messageId, body);
      this.receiveUpdate(message);
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  async remove(messageId: number) {
    try {
      const { message } = await chatApi.remove(messageId);
      this.receiveUpdate(message);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  // ─── საუბრები ───

  /** პირადი საუბარი თანამშრომელთან (არსებული ან ახალი); აბრუნებს id-ს. */
  async openDirect(userId: number): Promise<number | null> {
    const existing = Object.values(this.state.conversations).find((c) => c.type === "direct" && c.peer?.id === userId);
    if (existing) return existing.id;
    try {
      const { conversationId } = await chatApi.openDirect(userId);
      await this.refreshConversation(conversationId);
      return conversationId;
    } catch (error) {
      toast.error(errorText(error));
      return null;
    }
  }

  async createGroup(name: string, memberIds: number[]): Promise<number | null> {
    try {
      const { conversationId } = await chatApi.createGroup(name, memberIds);
      await this.refreshConversation(conversationId);
      return conversationId;
    } catch (error) {
      toast.error(errorText(error));
      return null;
    }
  }

  private async updateConversation(id: number, data: { name?: string; muted?: boolean; pinned?: boolean }) {
    try {
      const { conversation } = await chatApi.updateConversation(id, data);
      this.upsertDetail(conversation);
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  rename(id: number, name: string) {
    return this.updateConversation(id, { name });
  }

  setMuted(id: number, muted: boolean) {
    this.updateSummary(id, (c) => ({ ...c, muted }));
    return this.updateConversation(id, { muted });
  }

  setPinned(id: number, pinned: boolean) {
    this.updateSummary(id, (c) => ({ ...c, pinned }));
    return this.updateConversation(id, { pinned });
  }

  async addMembers(id: number, userIds: number[]) {
    try {
      await chatApi.addMembers(id, userIds);
      await this.refreshConversation(id);
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  async removeMember(id: number, userId: number) {
    try {
      await chatApi.removeMember(id, userId);
      if (userId === this.meId) this.dropConversation(id);
      else await this.refreshConversation(id);
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  leave(id: number) {
    return this.removeMember(id, this.meId);
  }

  /** საუბრის წაშლა ჩემთვის: ქრება სიიდან და ისტორია აღარ ჩანს (ახალ შეტყობინებაზე ისევ გამოჩნდება). */
  async clearConversation(id: number) {
    try {
      await chatApi.clearConversation(id);
      this.dropConversation(id);
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  // ─── Favorites ───

  isFavorite(userId: number) {
    return this.state.favorites?.some((f) => f.id === userId) ?? false;
  }

  async toggleFavorite(contact: ChatContact) {
    const was = this.isFavorite(contact.id);
    const previous = this.state.favorites;
    this.setState((s) => ({
      ...s,
      favorites: was
        ? (s.favorites ?? []).filter((f) => f.id !== contact.id)
        : [...(s.favorites ?? []), { ...contact, isFavorite: true }].sort(
            (a, b) => a.lastName.localeCompare(b.lastName, "ka") || a.firstName.localeCompare(b.firstName, "ka"),
          ),
    }));
    try {
      if (was) await chatApi.removeFavorite(contact.id);
      else await chatApi.addFavorite(contact.id);
    } catch (error) {
      this.setState((s) => ({ ...s, favorites: previous }));
      toast.error(errorText(error));
    }
  }

  // ─── პარამეტრები ───

  async updateSettings(data: Partial<ChatState["settings"]>) {
    const previous = this.state.settings;
    this.setState((s) => ({ ...s, settings: { ...s.settings, ...data } }));
    try {
      const { settings } = await chatApi.updateSettings(data);
      this.setState((s) => ({ ...s, settings }));
    } catch (error) {
      this.setState((s) => ({ ...s, settings: previous }));
      toast.error(errorText(error));
    }
  }

  // ─── popup ───

  setPopup(popup: Partial<ChatState["popup"]>) {
    this.setState((s) => ({ ...s, popup: { ...s.popup, ...popup } }));
  }
}
