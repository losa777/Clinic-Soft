/**
 * ჩატის მონაცემები API-სა და სოკეტში (JSON: id — number, თარიღი — ISO სტრიქონი).
 * BIGINT id-ები Number-ად გადადის — 2^53-მდე უსაფრთხოა.
 */

import type { LiveEvent } from "@/lib/live-types";

export type ConversationType = "direct" | "group";
export type MemberRole = "owner" | "member";

/** online — აქტიური, away — არ არის კომპიუტერთან, dnd — არ შემაწუხოთ, offline — გასულია. */
export type PresenceStatus = "online" | "away" | "dnd" | "offline";

/** lastSeenAt — „ბოლოს იყო“ (გასულზე); შესულზე — null */
export type Presence = { status: PresenceStatus; lastSeenAt: string | null };

/** ხელით დაყენებული სტატუსი: dnd — „არ შემაწუხოთ“, null — ავტომატური */
export type ManualStatus = "dnd" | null;

/** avatar — პროფილის ფოტოს ვერსია (src/lib/avatar-url.ts); null — ინიციალები */
export type UserRef = { id: number; firstName: string; lastName: string; avatar: number | null };

export type ChatUser = UserRef & { roleName: string; isActive: boolean };

/** ძებნის შედეგი / Favorites. */
export type ChatContact = ChatUser & { isFavorite: boolean; presence: Presence };

/** call_* — ზარის ისტორია პირად საუბარში (ავტორი — დამრეკი, target — ვისაც დაურეკეს; call_ended-ის body — წამები). */
export type SystemEvent =
  | "created"
  | "renamed"
  | "member_added"
  | "member_removed"
  | "member_left"
  | "call_ended"
  | "call_missed"
  | "call_declined";

/**
 * ზარის დასრულების მიზეზი: declined — უარყო, missed — არ უპასუხა (30 წმ), cancelled — დამრეკმა გათიშა პასუხამდე,
 * ended — საუბარი დასრულდა, busy — სხვა ზარშია, disconnected — კავშირი გაწყდა, elsewhere — სხვა ტაბში უპასუხა/უარყო.
 */
export type CallEndReason = "declined" | "missed" | "cancelled" | "ended" | "busy" | "disconnected" | "elsewhere";

/** WebRTC-ის სიგნალი (სერვერი მხოლოდ გადასცემს მეორე მონაწილის ტაბს). */
export type CallSignal =
  | { type: "offer" | "answer"; sdp: string }
  | { type: "candidate"; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } };

export type CallAck = { ok: true } | { ok: false; error: string };

export type ChatAttachment = {
  id: number;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
};

export type ChatQuote = { id: number; sender: UserRef; text: string; deleted: boolean; hasAttachments: boolean };

export type ChatMessage = {
  id: number;
  conversationId: number;
  kind: "text" | "system";
  sender: UserRef;
  /** წაშლილზე — null */
  body: string | null;
  event: SystemEvent | null;
  target: UserRef | null;
  replyTo: ChatQuote | null;
  attachments: ChatAttachment[];
  clientId: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
};

export type LastMessage = { id: number; senderId: number; senderName: string; text: string; at: string };

export type ConversationSummary = {
  id: number;
  type: ConversationType;
  /** ჯგუფის სახელი ან პირად საუბარში — თანამშრომლის სახელი, გვარი */
  name: string;
  /** პირადი საუბრის მეორე მონაწილე სტატუსით */
  peer: (ChatUser & { presence: Presence }) | null;
  role: MemberRole;
  muted: boolean;
  pinned: boolean;
  unread: number;
  lastReadMessageId: number;
  lastMessage: LastMessage | null;
  /** დალაგება: ბოლო შეტყობინება, ან შექმნის დრო */
  activityAt: string;
};

export type ConversationMemberInfo = ChatUser & { role: MemberRole; lastReadMessageId: number; presence: Presence };

export type ConversationDetail = ConversationSummary & { members: ConversationMemberInfo[] };

export type MessagePage = { messages: ChatMessage[]; hasMoreBefore: boolean; hasMoreAfter: boolean };

export type PresenceUpdate = Presence & { userId: number };

/** მომხმარებლის ჩატის პარამეტრები (user_chat_settings). */
export type ChatSettings = { soundEnabled: boolean; notificationsEnabled: boolean };

/** სერვერი → ბრაუზერი */
export interface ServerToClientEvents {
  "message:new": (message: ChatMessage) => void;
  "message:updated": (message: ChatMessage) => void;
  "conversation:read": (e: { conversationId: number; userId: number; lastReadMessageId: number }) => void;
  /** საუბარი შეიქმნა ან შეიცვალა (სახელი, მონაწილეები, mute/pin) — ბრაუზერი ხელახლა კითხულობს */
  "conversation:changed": (e: { conversationId: number }) => void;
  /** მომხმარებელი საუბრიდან ამოიშალა / გავიდა */
  "conversation:removed": (e: { conversationId: number }) => void;
  /** ძველი შეტყობინებები წაიშალა (ადმინის გასუფთავება) — სია და ჩატვირთული ისტორია თავიდან */
  "history:purged": () => void;
  typing: (e: { conversationId: number; userId: number }) => void;
  presence: (e: PresenceUpdate) => void;
  /** დაკავშირებისას: ყველა შესული (არა offline) თანამშრომლის სტატუსი */
  "presence:snapshot": (list: PresenceUpdate[]) => void;
  "session:ended": (e: { reason: "logout" | "expired" | "deactivated" }) => void;
  /** დაკავშირებისას: ვისი სესიით (cookie) მუშაობს კავშირი — ტაბი ამოწმებს, იგივე მომხმარებელია თუ არა */
  "session:user": (e: { userId: number }) => void;
  /** სხვა მოდულების მონაცემები შეიცვალა (ჯავშნები, ინვოისები...) — ღია გვერდები ახლდება (src/lib/live.ts) */
  "live:changed": (e: LiveEvent) => void;
  /** შემომავალი ზარი — მომხმარებლის ყველა ტაბს */
  "call:incoming": (e: { callId: string; from: UserRef }) => void;
  /** ზარს უპასუხეს — მხოლოდ დამრეკის ტაბს */
  "call:accepted": (e: { callId: string }) => void;
  "call:signal": (e: { callId: string; signal: CallSignal }) => void;
  "call:ended": (e: { callId: string; reason: CallEndReason }) => void;
}

/** ბრაუზერი → სერვერი */
export interface ClientToServerEvents {
  typing: (e: { conversationId: number }) => void;
  /** მომხმარებლის აქტივობა (throttle-ით) */
  activity: () => void;
  "call:invite": (e: { callId: string; toUserId: number }, ack: (r: CallAck) => void) => void;
  "call:accept": (e: { callId: string }, ack: (r: CallAck) => void) => void;
  "call:decline": (e: { callId: string }) => void;
  /** გათიშვა: პასუხამდე (დამრეკი) ან საუბრის დროს (ნებისმიერი) */
  "call:hangup": (e: { callId: string }) => void;
  "call:signal": (e: { callId: string; signal: CallSignal }) => void;
}
