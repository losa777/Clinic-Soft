import type { Db } from "@/modules/chat/server/db";
import { MESSAGE_SELECT, toMessage } from "@/modules/chat/server/dto";
import type { ChatMessage, SystemEvent } from "@/modules/chat/types";

/**
 * ჩანაწერის საბაზისო ოპერაციები წვდომის შემოწმების გარეშე — იძახებენ messages.ts / conversations.ts (შემოწმების
 * შემდეგ) და სოკეტ-სერვერი (ზარების ისტორია, realtime/call-log.ts). „server-only“ აქ არ არის: server.ts-ს tsx
 * უშვებს react-server პირობის გარეშე.
 */

export const directKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** ახალი პირადი საუბარი (direct_key UNIQUE — ერთდროული შექმნისას ერთ-ერთი ვარდება). */
export async function createDirect(tx: Db, userId: number, otherUserId: number): Promise<number> {
  const now = new Date();
  const conversation = await tx.conversation.create({
    data: {
      type: "direct",
      directKey: directKey(userId, otherUserId),
      createdById: userId,
      createdAt: now,
      members: {
        create: [
          { userId, role: "member", joinedAt: now },
          { userId: otherUserId, role: "member", joinedAt: now },
        ],
      },
    },
    select: { id: true },
  });
  return conversation.id;
}

/**
 * ახალი შეტყობინების შემდეგ: საუბრის ბოლო შეტყობინება და ავტორის „წაკითხულია“ (საკუთარი არ ითვლება წაუკითხავად).
 * GREATEST — ერთდროული გაგზავნისას უფრო ძველი id ახალს არ გადაეწერება. last_message_at ჯერ ითვლება (ძველი id-ით).
 */
export async function touchConversation(tx: Db, conversationId: number, messageId: bigint, userId: number, at: Date) {
  await tx.$executeRaw`
    UPDATE conversations
    SET last_message_at = IF(${messageId} > COALESCE(last_message_id, 0), ${at}, last_message_at),
        last_message_id = GREATEST(COALESCE(last_message_id, 0), ${messageId})
    WHERE id = ${conversationId}
  `;
  await tx.$executeRaw`
    UPDATE conversation_members SET last_read_message_id = GREATEST(last_read_message_id, ${messageId})
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
  `;
}

/** მოვლენა (ჯგუფის ცვლილება, ზარი) — ჩანს ისტორიაში და სიის ნაწყვეტში. */
export async function createSystemMessage(
  tx: Db,
  conversationId: number,
  actorId: number,
  event: SystemEvent,
  extra: { targetUserId?: number; body?: string } = {},
): Promise<ChatMessage> {
  const createdAt = new Date();
  const row = await tx.message.create({
    data: { conversationId, senderId: actorId, kind: "system", event, targetUserId: extra.targetUserId ?? null, body: extra.body ?? null, createdAt },
    select: MESSAGE_SELECT,
  });
  await touchConversation(tx, conversationId, row.id, actorId, createdAt);
  return toMessage(row);
}
