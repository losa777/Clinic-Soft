import type { ChatAttachment, ChatContact, ChatMessage, ChatSettings, ConversationDetail, ConversationSummary, ManualStatus, Presence, UserRef } from "@/modules/chat/types";

/**
 * ჩატის state ბრაუზერში — ერთი ტაბზე, საერთო სრული გვერდისა და popup-ისთვის (ChatProvider, layout-ში).
 * immutable განახლებები; კომპონენტები იწერენ useChat(selector)-ით (useSyncExternalStore).
 */

/** ჯერ ატვირთვის პროცესში: localUrl — ბრაუზერის preview (URL.createObjectURL). */
export type UiAttachment = ChatAttachment & { localUrl?: string };

/** გაგზავნის პროცესში / ვერ გაიგზავნა (optimistic UI). id < 0 — ჯერ სერვერზე არ არის. */
export type UiMessage = Omit<ChatMessage, "attachments"> & { attachments: UiAttachment[]; pending?: "sending" | "failed"; error?: string };

/** სქროლი კონკრეტულ შეტყობინებაზე (ძებნის შედეგი) ან ბოლოში; seq — ყოველ მოთხოვნაზე იზრდება. */
export type FocusTarget = { id: number | "bottom" | "unread"; seq: number };

export type MessagesState = {
  /** სერვერზე შენახული, ზრდადი id-ით */
  items: UiMessage[];
  /** optimistic: იგზავნება / ვერ გაიგზავნა */
  pending: UiMessage[];
  hasMoreBefore: boolean;
  /** true — ნაჩვენებია ძველი ნაწილი (ძებნიდან), ახალი შეტყობინებები ქვემოთ ჯერ ჩასატვირთია */
  hasMoreAfter: boolean;
  status: "loading" | "ready" | "error";
  loadingOlder: boolean;
  loadingNewer: boolean;
  error: string | null;
  /** „ახალი შეტყობინებები“ ზოლი — პირველი წაუკითხავი, საუბრის გახსნისას */
  firstUnreadId: number | null;
  focus: FocusTarget | null;
};

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "unauthorized";

export type ChatState = {
  me: UserRef;
  connection: ConnectionState;
  /** ერთხელ მაინც დაკავშირდა — „კავშირი გაწყდა“ ჩანს მხოლოდ ამის შემდეგ */
  everConnected: boolean;
  conversationsStatus: "loading" | "ready" | "error";
  conversations: Record<number, ConversationSummary>;
  /** დალაგებული: ჩამაგრებული, შემდეგ ბოლო აქტივობით */
  order: number[];
  details: Record<number, ConversationDetail>;
  messages: Record<number, MessagesState>;
  presence: Record<number, Presence>;
  /** საუბარი → თანამშრომელი → „წერს...“-ის ვადა (ms) */
  typing: Record<number, Record<number, number>>;
  favorites: ChatContact[] | null;
  manualStatus: ManualStatus;
  settings: ChatSettings;
  popup: { open: boolean; conversationId: number | null };
};

export function initialState(me: UserRef): ChatState {
  return {
    me,
    connection: "connecting",
    everConnected: false,
    conversationsStatus: "loading",
    conversations: {},
    order: [],
    details: {},
    messages: {},
    presence: {},
    typing: {},
    favorites: null,
    manualStatus: null,
    settings: { soundEnabled: true, notificationsEnabled: true },
    popup: { open: false, conversationId: null },
  };
}

export function emptyMessages(): MessagesState {
  return {
    items: [],
    pending: [],
    hasMoreBefore: false,
    hasMoreAfter: false,
    status: "loading",
    loadingOlder: false,
    loadingNewer: false,
    error: null,
    firstUnreadId: null,
    focus: null,
  };
}

export class Store<T> {
  private listeners = new Set<() => void>();
  private state: T;

  constructor(state: T) {
    this.state = state;
  }

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(update: (s: T) => T) {
    const next = update(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
  }
}

/** სიის დალაგება: ჩამაგრებული პირველი, შემდეგ ბოლო აქტივობა (ახალი ზემოთ). */
export function sortConversations(conversations: Record<number, ConversationSummary>): number[] {
  return Object.values(conversations)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.activityAt.localeCompare(a.activityAt) || b.id - a.id)
    .map((c) => c.id);
}

/** შეტყობინებების შერწყმა id-ით (განახლებული ცვლის ძველს), ზრდადი რიგით. */
export function mergeMessages(current: UiMessage[], incoming: ChatMessage[]): UiMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
