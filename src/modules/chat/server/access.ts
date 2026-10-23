import "server-only";
import { ChatError, conversationNotFound } from "@/modules/chat/server/errors";
import type { Db } from "@/modules/chat/server/db";

/**
 * წვდომის წესი: მომხმარებელი ხედავს და ცვლის მხოლოდ იმ საუბარს, რომლის მონაწილეცაა.
 * უცხო საუბარზე — 404 (არსებობა არ მჟღავნდება). ყოველი ჩატის ფუნქცია აქედან იწყება.
 */
export async function requireMember(db: Db, userId: number, conversationId: number) {
  const member = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: {
      role: true,
      lastReadMessageId: true,
      clearedMessageId: true,
      conversation: { select: { id: true, type: true, name: true, lastMessageId: true } },
    },
  });
  if (!member) throw conversationNotFound();
  return member;
}

/** ჯგუფის მართვა (სახელი, მონაწილეები) — მხოლოდ შემქმნელი (owner). */
export async function requireGroupOwner(db: Db, userId: number, conversationId: number) {
  const member = await requireMember(db, userId, conversationId);
  if (member.conversation.type !== "group") throw new ChatError("ეს მოქმედება მხოლოდ ჯგუფურ საუბარშია შესაძლებელი", 409);
  if (member.role !== "owner") throw new ChatError("ჯგუფს მართავს მხოლოდ მისი შემქმნელი", 403);
  return member;
}

/** საუბრის ჩაკეტვა ტრანზაქციის ბოლომდე: მონაწილეების ერთდროული ცვლილება ერთმანეთს არ გადაეწერება. */
export async function lockConversation(tx: Db, conversationId: number) {
  await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`;
}

/** მხოლოდ აქტიური თანამშრომლები (გათიშულს ჩატში ვერ დაამატებ და ვერ მისწერ). */
export async function requireActiveUsers(db: Db, userIds: number[]): Promise<number[]> {
  const unique = [...new Set(userIds)];
  const found = await db.user.findMany({ where: { id: { in: unique }, isActive: true }, select: { id: true } });
  if (found.length !== unique.length) throw new ChatError("თანამშრომელი ვერ მოიძებნა ან გათიშულია", 409);
  return unique;
}
