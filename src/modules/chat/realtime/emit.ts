import type { ChatMessage } from "@/modules/chat/types";
import { chatServer, conversationRoom, sessionRoom, userRoom } from "@/modules/chat/realtime/registry";

/**
 * ცვლილებების გაგზავნა სოკეტით (Route Handler-ებიდან, ტრანზაქციის დადასტურების შემდეგ).
 * სოკეტ-სერვერი თუ არ არის გაშვებული (`next dev`, ტესტები) — არაფერს აკეთებს.
 */

export function emitMessage(kind: "message:new" | "message:updated", message: ChatMessage) {
  chatServer()?.to(conversationRoom(message.conversationId)).emit(kind, message);
}

export function emitRead(conversationId: number, userId: number, lastReadMessageId: number) {
  chatServer()?.to(conversationRoom(conversationId)).emit("conversation:read", { conversationId, userId, lastReadMessageId });
}

/** საუბარი შეიცვალა: ყველა მონაწილეს, ან (mute/pin) მხოლოდ ერთ მომხმარებელს — მის ყველა ტაბს. */
export function emitConversationChanged(conversationId: number, onlyUserId?: number) {
  const room = onlyUserId === undefined ? conversationRoom(conversationId) : userRoom(onlyUserId);
  chatServer()?.to(room).emit("conversation:changed", { conversationId });
}

/** ახალი მონაწილეების ტაბები უერთდება საუბრის ოთახს (მიიღებენ შეტყობინებებს და „წერს...“-ს). */
export function joinConversation(userIds: number[], conversationId: number) {
  const io = chatServer();
  if (!io || userIds.length === 0) return;
  io.in(userIds.map(userRoom)).socketsJoin(conversationRoom(conversationId));
}

/** მონაწილე ამოიშალა / გავიდა: ტოვებს ოთახს და მის ტაბებს საუბარი უქრება. */
export function leaveConversation(userId: number, conversationId: number) {
  const io = chatServer();
  if (!io) return;
  io.in(userRoom(userId)).socketsLeave(conversationRoom(conversationId));
  io.to(userRoom(userId)).emit("conversation:removed", { conversationId });
}

/** „საუბრის წაშლა ჩემთვის“: ქრება მომხმარებლის ყველა ტაბში; ოთახში რჩება — ახალ შეტყობინებაზე ისევ გამოჩნდება. */
export function emitConversationHidden(userId: number, conversationId: number) {
  chatServer()?.to(userRoom(userId)).emit("conversation:removed", { conversationId });
}

/** ადმინმა ისტორია გაასუფთავა (ან ავტომატური გასუფთავება): ყველა შესული ხელახლა კითხულობს სიას და ღია საუბრებს. */
export function emitHistoryPurged() {
  chatServer()?.emit("history:purged");
}

/**
 * სესიის დასრულება: გასვლა (მხოლოდ ამ შესვლის ტაბები — sid) ან გათიშვა/წაშლა (ყველა ტაბი).
 * კავშირი წყდება — მომხმარებელი სხვებთან „გასულია“ ხდება (თუ სხვაგან შესული არ არის).
 */
export function endChatSessions(userId: number, reason: "logout" | "deactivated", sid?: string | null) {
  const io = chatServer();
  if (!io) return;
  const room = reason === "logout" && sid ? sessionRoom(sid) : userRoom(userId);
  io.to(room).emit("session:ended", { reason });
  io.in(room).disconnectSockets(true);
}
