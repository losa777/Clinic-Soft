import "server-only";
import { isUniqueViolation } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { MESSAGE_CATCH_UP_MAX, MESSAGE_PAGE_SIZE, MESSAGE_SEARCH_LIMIT } from "@/modules/chat/config";
import { requireMember } from "@/modules/chat/server/access";
import type { StoredAttachment } from "@/modules/chat/server/attachments";
import { touchConversation } from "@/modules/chat/server/core";
import { type Db, inTx, likeEscape } from "@/modules/chat/server/db";
import { MESSAGE_SELECT, toMessage } from "@/modules/chat/server/dto";
import { ChatError, messageNotFound } from "@/modules/chat/server/errors";
import type { ChatMessage, MessagePage } from "@/modules/chat/types";

/**
 * შეტყობინებები. ყველა მოთხოვნა იყენებს ინდექსს (conversation_id, id); cursor — შეტყობინების id.
 * შეტყობინება ფიზიკურად არ იშლება: რედაქტირება/წაშლა ინახავს ძველ ტექსტს message_revisions-ში.
 */

export type PageQuery = { before?: number; after?: number; around?: number; limit?: number };

/**
 * ისტორიის ნაწილი (ზრდადი რიგით):
 * - before — უფრო ძველი (ზემოთ სქროლვა); after — უფრო ახალი (ხელახლა დაკავშირება); around — ძებნის შედეგის ირგვლივ;
 * - არაფერი — ბოლო გვერდი.
 */
export async function listMessages(db: Db, userId: number, conversationId: number, q: PageQuery): Promise<MessagePage> {
  const { clearedMessageId: cleared } = await requireMember(db, userId, conversationId);
  const limit = q.limit ?? MESSAGE_PAGE_SIZE;
  // „საუბრის წაშლა ჩემთვის“ — cleared-მდე შეტყობინებები არ ჩანს
  const page = (where: { lt?: bigint; lte?: bigint; gt?: bigint }, dir: "asc" | "desc", take: number) =>
    db.message.findMany({
      where: { conversationId, id: { ...where, gt: where.gt !== undefined && where.gt > cleared ? where.gt : cleared } },
      orderBy: { id: dir },
      take: take + 1,
      select: MESSAGE_SELECT,
    });

  if (q.after !== undefined) {
    const take = Math.min(limit, MESSAGE_CATCH_UP_MAX);
    const rows = await page({ gt: BigInt(q.after) }, "asc", take);
    return { messages: rows.slice(0, take).map(toMessage), hasMoreBefore: true, hasMoreAfter: rows.length > take };
  }
  if (q.around !== undefined) {
    const half = Math.ceil(limit / 2);
    const [older, newer] = await Promise.all([
      page({ lte: BigInt(q.around) }, "desc", half),
      page({ gt: BigInt(q.around) }, "asc", half),
    ]);
    return {
      messages: [...older.slice(0, half).reverse(), ...newer.slice(0, half)].map(toMessage),
      hasMoreBefore: older.length > half,
      hasMoreAfter: newer.length > half,
    };
  }
  const rows = await page(q.before !== undefined ? { lt: BigInt(q.before) } : {}, "desc", limit);
  return { messages: rows.slice(0, limit).reverse().map(toMessage), hasMoreBefore: rows.length > limit, hasMoreAfter: false };
}

/** ძებნა საუბრის შიგნით (ტექსტში, წაშლილის გარეშე), უახლესი პირველი; before — შემდეგი გვერდი. */
export async function searchMessages(db: Db, userId: number, conversationId: number, query: string, before?: number) {
  const { clearedMessageId: cleared } = await requireMember(db, userId, conversationId);
  // likeEscape — %/_ ჩვეულებრივი სიმბოლოა; utf8mb4_unicode_ci — რეგისტრის მიუხედავად
  const rows = await db.message.findMany({
    where: {
      conversationId,
      kind: "text",
      deletedAt: null,
      body: { contains: likeEscape(query.toLowerCase()) },
      id: { gt: cleared, ...(before !== undefined ? { lt: BigInt(before) } : {}) },
    },
    orderBy: { id: "desc" },
    take: MESSAGE_SEARCH_LIMIT + 1,
    select: MESSAGE_SELECT,
  });
  return { messages: rows.slice(0, MESSAGE_SEARCH_LIMIT).map(toMessage), hasMore: rows.length > MESSAGE_SEARCH_LIMIT };
}

export type SendInput = { body: string; replyToId?: number; clientId?: string; attachments?: StoredAttachment[] };

/** გაგზავნა. იგივე clientId-ით განმეორებითი მოთხოვნა (ხელახლა ცდა) აბრუნებს უკვე შენახულს — duplicate: true. */
export async function sendMessage(tx: Db, userId: number, conversationId: number, input: SendInput) {
  const member = await requireMember(tx, userId, conversationId);
  if (input.clientId) {
    const existing = await findByClientId(tx, userId, input.clientId);
    if (existing) {
      if (existing.conversationId !== conversationId) throw new ChatError("შეტყობინების იდენტიფიკატორი უკვე გამოყენებულია", 409);
      return { message: existing, duplicate: true };
    }
  }
  if (member.conversation.type === "direct") {
    const peer = await tx.conversationMember.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { user: { select: { isActive: true } } },
    });
    if (!peer?.user.isActive) throw new ChatError("თანამშრომელი გათიშულია — შეტყობინებას ვერ გაუგზავნით", 409);
  }
  if (input.replyToId !== undefined) {
    const quoted = await tx.message.findFirst({ where: { id: BigInt(input.replyToId), conversationId }, select: { id: true } });
    if (!quoted) throw new ChatError("შეტყობინება, რომელსაც პასუხობთ, ვერ მოიძებნა", 409);
  }
  const attachments = input.attachments ?? [];
  if (!input.body && attachments.length === 0) throw new ChatError("შეტყობინება ცარიელია");

  const createdAt = new Date();
  const row = await tx.message.create({
    data: {
      conversationId,
      senderId: userId,
      kind: "text",
      body: input.body || null,
      replyToId: input.replyToId !== undefined ? BigInt(input.replyToId) : null,
      clientId: input.clientId ?? null,
      createdAt,
      attachments: attachments.length ? { create: attachments } : undefined,
    },
    select: MESSAGE_SELECT,
  });
  await touchConversation(tx, conversationId, row.id, userId, createdAt);
  return { message: toMessage(row), duplicate: false };
}

async function findByClientId(db: Db, userId: number, clientId: string): Promise<ChatMessage | null> {
  const row = await db.message.findUnique({ where: { senderId_clientId: { senderId: userId, clientId } }, select: MESSAGE_SELECT });
  return row ? toMessage(row) : null;
}

/** sendMessage საკუთარ ტრანზაქციაში; ერთდროული ორი ცდა ერთი clientId-ით (UNIQUE) — მეორე იღებს პირველის შედეგს. */
export async function sendMessageOnce(userId: number, conversationId: number, input: SendInput) {
  try {
    return await inTx((tx) => sendMessage(tx, userId, conversationId, input));
  } catch (error) {
    if (input.clientId && isUniqueViolation(error)) {
      const existing = await findByClientId(prisma, userId, input.clientId);
      if (existing && existing.conversationId === conversationId) return { message: existing, duplicate: true };
    }
    throw error;
  }
}

/** საკუთარი, წაუშლელი, ტექსტური შეტყობინება — ჩაკეტილი ტრანზაქციის ბოლომდე. */
async function lockOwnMessage(tx: Db, userId: number, messageId: number) {
  const id = BigInt(messageId);
  const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM messages WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw messageNotFound();
  const message = await tx.message.findUniqueOrThrow({
    where: { id },
    select: { id: true, conversationId: true, senderId: true, kind: true, body: true, deletedAt: true, _count: { select: { attachments: true } } },
  });
  // უცხო საუბრის შეტყობინება — 404, როგორც არარსებული
  await requireMember(tx, userId, message.conversationId).catch(() => {
    throw messageNotFound();
  });
  if (message.kind !== "text") throw new ChatError("სისტემური შეტყობინება არ იცვლება", 403);
  if (message.senderId !== userId) throw new ChatError("შეცვლა და წაშლა შეიძლება მხოლოდ საკუთარი შეტყობინების", 403);
  if (message.deletedAt) throw new ChatError("შეტყობინება უკვე წაშლილია", 409);
  return message;
}

/** რედაქტირება: ძველი ტექსტი ინახება message_revisions-ში. */
export async function editMessage(tx: Db, userId: number, messageId: number, body: string): Promise<ChatMessage> {
  const message = await lockOwnMessage(tx, userId, messageId);
  if (!body && message._count.attachments === 0) throw new ChatError("შეტყობინება ცარიელია");
  if (body !== message.body) {
    const now = new Date();
    await tx.messageRevision.create({ data: { messageId: message.id, action: "edit", oldBody: message.body, userId, createdAt: now } });
    await tx.message.update({ where: { id: message.id }, data: { body, editedAt: now } });
  }
  return toMessage(await tx.message.findUniqueOrThrow({ where: { id: message.id }, select: MESSAGE_SELECT }));
}

/** წაშლა (soft delete): ტექსტი და ფაილები ბაზაში/დისკზე რჩება, API-ში აღარ გადის; ფიქსირდება ვინ და როდის. */
export async function deleteMessage(tx: Db, userId: number, messageId: number): Promise<ChatMessage> {
  const message = await lockOwnMessage(tx, userId, messageId);
  const now = new Date();
  await tx.messageRevision.create({ data: { messageId: message.id, action: "delete", oldBody: message.body, userId, createdAt: now } });
  await tx.message.update({ where: { id: message.id }, data: { deletedAt: now } });
  return toMessage(await tx.message.findUniqueOrThrow({ where: { id: message.id }, select: MESSAGE_SELECT }));
}

/**
 * წაკითხულად მონიშვნა messageId-მდე (არა უმეტეს საუბრის ბოლო შეტყობინებისა). მხოლოდ წინ მიიწევს.
 * changed: false — უკვე წაკითხული იყო (სხვებს არაფერი ეგზავნება).
 */
export async function markRead(tx: Db, userId: number, conversationId: number, messageId: number) {
  const member = await requireMember(tx, userId, conversationId);
  const last = member.conversation.lastMessageId ?? BigInt(0);
  const target = BigInt(messageId) < last ? BigInt(messageId) : last;
  const changed = await tx.$executeRaw`
    UPDATE conversation_members SET last_read_message_id = ${target}
    WHERE conversation_id = ${conversationId} AND user_id = ${userId} AND last_read_message_id < ${target}
  `;
  return { lastReadMessageId: Number(changed > 0 ? target : member.lastReadMessageId), changed: changed > 0 };
}
