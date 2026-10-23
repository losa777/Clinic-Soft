import type {
  ChatContact,
  ChatMessage,
  ChatSettings,
  ConversationDetail,
  ConversationSummary,
  ManualStatus,
  MessagePage,
  Presence,
} from "@/modules/chat/types";

/** ჩატის REST API ბრაუზერიდან (src/app/api/chat/). შეცდომა — ChatApiError ქართული ტექსტით. */

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    const form = body instanceof FormData;
    res = await fetch(`/api/chat${path}`, {
      method,
      cache: "no-store",
      // გვერდის დატოვებისასაც სრულდება (წაკითხვის მონიშვნა)
      keepalive,
      // FormData — content-type (boundary-ით) ბრაუზერი თვითონ სვამს
      headers: body !== undefined && !form ? { "content-type": "application/json" } : undefined,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
  } catch {
    throw new ChatApiError("სერვერთან კავშირი ვერ დამყარდა", 0);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ChatApiError(data?.error ?? "შეცდომა, სცადეთ თავიდან", res.status);
  return data as T;
}

const query = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const chatApi = {
  conversations: () => request<{ conversations: ConversationSummary[] }>("GET", "/conversations"),
  conversation: (id: number) => request<{ conversation: ConversationDetail }>("GET", `/conversations/${id}`),
  openDirect: (userId: number) => request<{ conversationId: number }>("POST", "/conversations", { type: "direct", userId }),
  createGroup: (name: string, memberIds: number[]) =>
    request<{ conversationId: number }>("POST", "/conversations", { type: "group", name, memberIds }),
  updateConversation: (id: number, data: { name?: string; muted?: boolean; pinned?: boolean }) =>
    request<{ conversation: ConversationDetail }>("PATCH", `/conversations/${id}`, data),
  /** საუბრის წაშლა ჩემთვის */
  clearConversation: (id: number) => request<{ ok: true }>("DELETE", `/conversations/${id}`),
  addMembers: (id: number, userIds: number[]) => request<{ added: number[] }>("POST", `/conversations/${id}/members`, { userIds }),
  removeMember: (id: number, userId: number) => request<{ ok: true }>("DELETE", `/conversations/${id}/members/${userId}`),

  messages: (id: number, params: { before?: number; after?: number; around?: number; limit?: number } = {}) =>
    request<MessagePage>("GET", `/conversations/${id}/messages${query(params)}`),
  send: (id: number, input: { body: string; replyToId?: number; clientId: string }) =>
    request<{ message: ChatMessage }>("POST", `/conversations/${id}/messages`, input),
  /** ფაილებით (multipart): ტექსტი შეიძლება ცარიელი იყოს. */
  sendWithFiles: (id: number, input: { body: string; replyToId?: number; clientId: string; files: File[] }) => {
    const form = new FormData();
    form.set("body", input.body);
    form.set("clientId", input.clientId);
    if (input.replyToId) form.set("replyToId", String(input.replyToId));
    for (const f of input.files) form.append("files", f, f.name);
    return request<{ message: ChatMessage }>("POST", `/conversations/${id}/messages`, form);
  },
  edit: (messageId: number, body: string) => request<{ message: ChatMessage }>("PATCH", `/messages/${messageId}`, { body }),
  remove: (messageId: number) => request<{ message: ChatMessage }>("DELETE", `/messages/${messageId}`),
  markRead: (id: number, messageId: number) =>
    request<{ lastReadMessageId: number }>("POST", `/conversations/${id}/read`, { messageId }, true),
  searchMessages: (id: number, q: string, before?: number) =>
    request<{ messages: ChatMessage[]; hasMore: boolean }>("GET", `/conversations/${id}/search${query({ q, before })}`),

  searchUsers: (q: string) => request<{ users: ChatContact[] }>("GET", `/users${query({ q })}`),
  favorites: () => request<{ users: ChatContact[] }>("GET", "/favorites"),
  addFavorite: (userId: number) => request<{ ok: true }>("PUT", `/favorites/${userId}`),
  removeFavorite: (userId: number) => request<{ ok: true }>("DELETE", `/favorites/${userId}`),

  settings: () => request<{ settings: ChatSettings }>("GET", "/settings"),
  updateSettings: (data: Partial<ChatSettings>) => request<{ settings: ChatSettings }>("PUT", "/settings", data),

  presence: () => request<{ presence: Presence; manualStatus: ManualStatus }>("GET", "/presence"),
  setManualStatus: (manualStatus: ManualStatus) =>
    request<{ presence: Presence; manualStatus: ManualStatus }>("PUT", "/presence", { manualStatus }),
};
