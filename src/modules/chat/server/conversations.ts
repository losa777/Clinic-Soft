import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isUniqueViolation } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { GROUP_MAX_MEMBERS } from "@/modules/chat/config";
import { fullName, previewText } from "@/modules/chat/format";
import { lockConversation, requireActiveUsers, requireGroupOwner, requireMember } from "@/modules/chat/server/access";
import { bool, type Db, inTx, int } from "@/modules/chat/server/db";
import { toChatUser } from "@/modules/chat/server/dto";
import { ChatError, conversationNotFound } from "@/modules/chat/server/errors";
import { createSystemMessage } from "@/modules/chat/server/messages";
import { loadPresence } from "@/modules/chat/server/presence";
import type { ChatMessage, ConversationDetail, ConversationSummary, MemberRole, Presence } from "@/modules/chat/types";

/**
 * საუბრები: სია ერთი SQL მოთხოვნით (ბოლო შეტყობინება — conversations.last_message_id-ით, წაუკითხავები —
 * ქვემოთხოვნით ინდექსზე (conversation_id, id), პირადი საუბრის თანამშრომელი — JOIN-ით). N+1 არ არის.
 */

type SummaryRow = {
  id: number;
  type: "direct" | "group";
  name: string | null;
  createdAt: Date;
  lastMessageAt: Date | null;
  role: MemberRole;
  muted: unknown;
  pinned: unknown;
  lastRead: bigint;
  cleared: bigint;
  unread: bigint;
  lmId: bigint | null;
  lmKind: string | null;
  lmBody: string | null;
  lmEvent: string | null;
  lmDeletedAt: Date | null;
  lmAt: Date | null;
  lmSenderId: number | null;
  lmSenderFirst: string | null;
  lmSenderLast: string | null;
  lmTargetFirst: string | null;
  lmTargetLast: string | null;
  lmAttachments: bigint | null;
  peerId: number | null;
  peerFirst: string | null;
  peerLast: string | null;
  peerActive: unknown;
  peerRole: string | null;
};

async function querySummaries(db: Db, userId: number, filter: Prisma.Sql): Promise<ConversationSummary[]> {
  const rows = await db.$queryRaw<SummaryRow[]>`
    SELECT c.id, c.type, c.name, c.created_at AS createdAt, c.last_message_at AS lastMessageAt,
           m.role, m.muted, m.pinned, m.last_read_message_id AS lastRead, m.cleared_message_id AS cleared,
           (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.id AND x.id > m.last_read_message_id) AS unread,
           lm.id AS lmId, lm.kind AS lmKind, LEFT(lm.body, 300) AS lmBody, lm.event AS lmEvent,
           lm.deleted_at AS lmDeletedAt, lm.created_at AS lmAt, lm.sender_id AS lmSenderId,
           ls.first_name AS lmSenderFirst, ls.last_name AS lmSenderLast,
           lt.first_name AS lmTargetFirst, lt.last_name AS lmTargetLast,
           (SELECT COUNT(*) FROM message_attachments a WHERE a.message_id = lm.id) AS lmAttachments,
           p.id AS peerId, p.first_name AS peerFirst, p.last_name AS peerLast, p.is_active AS peerActive, pr.name AS peerRole
    FROM conversation_members m
    JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN messages lm ON lm.id = c.last_message_id
    LEFT JOIN users ls ON ls.id = lm.sender_id
    LEFT JOIN users lt ON lt.id = lm.target_user_id
    LEFT JOIN conversation_members pm ON c.type = 'direct' AND pm.conversation_id = c.id AND pm.user_id <> m.user_id
    LEFT JOIN users p ON p.id = pm.user_id
    LEFT JOIN roles pr ON pr.id = p.role_id
    WHERE m.user_id = ${userId} ${filter}
    ORDER BY m.pinned DESC, COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
  `;
  const presence = await loadPresence(db, rows.flatMap((r) => (r.peerId !== null ? [r.peerId] : [])));
  return rows.map((r) => toSummary(r, r.peerId !== null ? presence.get(r.peerId)! : null));
}

function toSummary(r: SummaryRow, peerPresence: Presence | null): ConversationSummary {
  const peer =
    r.peerId !== null && peerPresence
      ? {
          id: r.peerId,
          firstName: r.peerFirst ?? "",
          lastName: r.peerLast ?? "",
          roleName: r.peerRole ?? "",
          isActive: bool(r.peerActive),
          presence: peerPresence,
        }
      : null;
  const senderName = fullName({ firstName: r.lmSenderFirst ?? "", lastName: r.lmSenderLast ?? "" });
  return {
    id: r.id,
    type: r.type,
    name: r.type === "group" ? (r.name ?? "ჯგუფი") : peer ? fullName(peer) : "თანამშრომელი",
    peer,
    role: r.role,
    muted: bool(r.muted),
    pinned: bool(r.pinned),
    unread: int(r.unread),
    lastReadMessageId: int(r.lastRead),
    lastMessage:
      // „ჩემთვის წაშლილი“ ისტორიის ნაწყვეტი არ ჩანს
      r.lmId !== null && r.lmAt && int(r.lmId) > int(r.cleared)
        ? {
            id: int(r.lmId),
            senderId: r.lmSenderId ?? 0,
            senderName,
            text: previewText({
              kind: r.lmKind ?? "text",
              body: r.lmBody,
              deleted: r.lmDeletedAt !== null,
              event: r.lmEvent,
              actorName: senderName,
              targetName: r.lmTargetFirst !== null ? fullName({ firstName: r.lmTargetFirst, lastName: r.lmTargetLast ?? "" }) : null,
              attachments: int(r.lmAttachments),
            }),
            at: r.lmAt.toISOString(),
          }
        : null,
    activityAt: (r.lastMessageAt ?? r.createdAt).toISOString(),
  };
}

/**
 * მომხმარებლის საუბრები: ჩამაგრებული პირველი, შემდეგ ბოლო შეტყობინების დროით.
 * ცარიელი პირადი საუბარი (შეტყობინების გარეშე) ჩანს მხოლოდ მის შემქმნელს;
 * „ჩემთვის წაშლილი“ — მხოლოდ ახალი შეტყობინების მოსვლის შემდეგ.
 */
export function listConversations(db: Db, userId: number) {
  return querySummaries(
    db,
    userId,
    Prisma.sql`AND NOT (c.type = 'direct' AND c.last_message_id IS NULL AND (c.created_by IS NULL OR c.created_by <> m.user_id))
      AND (c.last_message_id IS NULL OR c.last_message_id > m.cleared_message_id)`,
  );
}

/**
 * „საუბრის წაშლა ჩემთვის“: სიიდან ქრება, ისტორია (ფაილებით) აღარ ჩანს — მხოლოდ ამ მონაწილეს.
 * ბაზაში არაფერი იშლება (აუდიტი), სხვა მონაწილეებს მიმოწერა რჩება; ახალ შეტყობინებაზე საუბარი ისევ ჩნდება.
 */
export async function clearConversation(tx: Db, userId: number, conversationId: number) {
  const member = await requireMember(tx, userId, conversationId);
  const last = member.conversation.lastMessageId ?? BigInt(0);
  await tx.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: {
      clearedMessageId: last,
      lastReadMessageId: last > member.lastReadMessageId ? last : member.lastReadMessageId,
      pinned: false,
    },
  });
}

/** ერთი საუბარი მონაწილეებით (წაკითხვის სტატუსისთვის — თითოეულის last_read_message_id). */
export async function getConversation(db: Db, userId: number, conversationId: number): Promise<ConversationDetail> {
  const [summary] = await querySummaries(db, userId, Prisma.sql`AND c.id = ${conversationId}`);
  if (!summary) throw conversationNotFound();
  const members = await db.conversationMember.findMany({
    where: { conversationId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }, { userId: "asc" }],
    select: {
      role: true,
      lastReadMessageId: true,
      user: { select: { id: true, firstName: true, lastName: true, isActive: true, role: { select: { name: true } } } },
    },
  });
  const presence = await loadPresence(db, members.map((m) => m.user.id));
  return {
    ...summary,
    members: members.map((m) => ({
      ...toChatUser(m.user),
      role: m.role,
      lastReadMessageId: Number(m.lastReadMessageId),
      presence: presence.get(m.user.id)!,
    })),
  };
}

/** მონაწილეების id-ები (სოკეტის ოთახებისთვის). */
export async function memberIds(db: Db, conversationId: number): Promise<number[]> {
  const rows = await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

const directKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * პირადი საუბარი: არსებული ან ახალი. direct_key UNIQUE — ორ ადამიანს შორის ერთი საუბარი.
 */
export async function openDirect(tx: Db, userId: number, otherUserId: number) {
  if (otherUserId === userId) throw new ChatError("საკუთარ თავთან საუბარი არ იქმნება");
  const key = directKey(userId, otherUserId);
  const existing = await tx.conversation.findUnique({ where: { directKey: key }, select: { id: true } });
  if (existing) return { conversationId: existing.id, created: false };

  await requireActiveUsers(tx, [otherUserId]);
  const now = new Date();
  const conversation = await tx.conversation.create({
    data: {
      type: "direct",
      directKey: key,
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
  return { conversationId: conversation.id, created: true };
}

/** openDirect საკუთარ ტრანზაქციაში; ერთდროული შექმნისას (UNIQUE direct_key) — არსებული საუბარი. */
export async function openDirectOnce(userId: number, otherUserId: number) {
  try {
    return await inTx((tx) => openDirect(tx, userId, otherUserId));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.conversation.findUnique({ where: { directKey: directKey(userId, otherUserId) }, select: { id: true } });
    if (!existing) throw error;
    return { conversationId: existing.id, created: false };
  }
}

/** ჯგუფი: შემქმნელი — owner, დანარჩენი — member. ისტორიაში — „ჯგუფი შეიქმნა“. */
export async function createGroup(tx: Db, userId: number, name: string, memberUserIds: number[]) {
  const others = await requireActiveUsers(tx, memberUserIds.filter((id) => id !== userId));
  if (others.length === 0) throw new ChatError("აირჩიეთ ერთი თანამშრომელი მაინც");
  if (others.length + 1 > GROUP_MAX_MEMBERS) throw new ChatError(`ჯგუფში მაქსიმუმ ${GROUP_MAX_MEMBERS} მონაწილეა`);
  const now = new Date();
  const conversation = await tx.conversation.create({
    data: {
      type: "group",
      name,
      createdById: userId,
      createdAt: now,
      members: {
        create: [{ userId, role: "owner", joinedAt: now }, ...others.map((id) => ({ userId: id, role: "member" as const, joinedAt: now }))],
      },
    },
    select: { id: true },
  });
  const message = await createSystemMessage(tx, conversation.id, userId, "created", { body: name });
  // ახალ მონაწილეებს „ჯგუფი შეიქმნა“ წაუკითხავად არ ეთვლებათ
  await tx.conversationMember.updateMany({
    where: { conversationId: conversation.id },
    data: { lastReadMessageId: BigInt(message.id) },
  });
  return { conversationId: conversation.id, memberIds: [userId, ...others], message };
}

/** mute / pin — მხოლოდ საკუთარი ჩანაწერი. */
export async function updateMembership(tx: Db, userId: number, conversationId: number, data: { muted?: boolean; pinned?: boolean }) {
  await requireMember(tx, userId, conversationId);
  await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data });
}

export async function renameGroup(tx: Db, userId: number, conversationId: number, name: string): Promise<ChatMessage | null> {
  const member = await requireGroupOwner(tx, userId, conversationId);
  if (member.conversation.name === name) return null;
  await tx.conversation.update({ where: { id: conversationId }, data: { name } });
  return createSystemMessage(tx, conversationId, userId, "renamed", { body: name });
}

/** მონაწილეების დამატება (owner). ახალი მონაწილე ისტორიას ხედავს, მაგრამ ძველი შეტყობინებები წაუკითხავად არ ეთვლება. */
export async function addMembers(tx: Db, userId: number, conversationId: number, userIds: number[]) {
  await requireGroupOwner(tx, userId, conversationId);
  await lockConversation(tx, conversationId);
  const current = new Set(await memberIds(tx, conversationId));
  const added = await requireActiveUsers(tx, userIds.filter((id) => !current.has(id)));
  if (added.length === 0) return { added, messages: [] as ChatMessage[] };
  if (current.size + added.length > GROUP_MAX_MEMBERS) throw new ChatError(`ჯგუფში მაქსიმუმ ${GROUP_MAX_MEMBERS} მონაწილეა`);

  const now = new Date();
  await tx.conversationMember.createMany({ data: added.map((id) => ({ conversationId, userId: id, role: "member" as const, joinedAt: now })) });
  const messages: ChatMessage[] = [];
  for (const id of added) messages.push(await createSystemMessage(tx, conversationId, userId, "member_added", { targetUserId: id }));
  await tx.conversationMember.updateMany({
    where: { conversationId, userId: { in: added } },
    data: { lastReadMessageId: BigInt(messages[messages.length - 1].id) },
  });
  return { added, messages };
}

/**
 * მონაწილის ამოშლა (owner) ან გასვლა (userId === targetUserId). ჩანაწერი იშლება — საუბარი მას აღარ უჩანს,
 * შეტყობინებები რჩება. owner თუ გადის — ჯგუფს ყველაზე ძველი მონაწილე იბარებს.
 */
export async function removeMember(tx: Db, userId: number, conversationId: number, targetUserId: number) {
  const leaving = targetUserId === userId;
  const member = leaving ? await requireMember(tx, userId, conversationId) : await requireGroupOwner(tx, userId, conversationId);
  if (member.conversation.type !== "group") throw new ChatError("პირადი საუბრიდან გასვლა შეუძლებელია", 409);
  await lockConversation(tx, conversationId);

  const target = await tx.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) throw new ChatError("თანამშრომელი ამ ჯგუფის წევრი არ არის", 404);

  const message = await createSystemMessage(tx, conversationId, userId, leaving ? "member_left" : "member_removed", {
    targetUserId: leaving ? undefined : targetUserId,
  });
  await tx.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId: targetUserId } } });

  if (target.role === "owner") {
    const heir = await tx.conversationMember.findFirst({ where: { conversationId }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }], select: { userId: true } });
    if (heir) await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: heir.userId } }, data: { role: "owner" } });
  }
  return { message };
}
