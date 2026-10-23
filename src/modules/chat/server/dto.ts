import type { Prisma } from "@/generated/prisma/client";
import { QUOTE_LENGTH } from "@/modules/chat/config";
import { snippet } from "@/modules/chat/format";
import type { ChatMessage, ChatUser, SystemEvent, UserRef } from "@/modules/chat/types";

/** ბაზის ჩანაწერები → API-ს ფორმა (types.ts). */

const USER_REF = { select: { id: true, firstName: true, lastName: true } } as const;

/** შეტყობინება ავტორით, პასუხის ნაწყვეტით და ფაილებით: Prisma კავშირებს ცალკე, IN-მოთხოვნებით ტვირთავს (N+1-ის გარეშე). */
export const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  kind: true,
  body: true,
  event: true,
  clientId: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  sender: USER_REF,
  targetUser: USER_REF,
  replyTo: {
    select: { id: true, body: true, deletedAt: true, sender: USER_REF, _count: { select: { attachments: true } } },
  },
  attachments: {
    select: { id: true, fileName: true, mimeType: true, size: true, width: true, height: true },
    orderBy: { id: "asc" },
  },
} as const satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

export function toUserRef(u: { id: number; firstName: string; lastName: string }): UserRef {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName };
}

export function toChatUser(u: { id: number; firstName: string; lastName: string; isActive: boolean; role: { name: string } }): ChatUser {
  return { ...toUserRef(u), roleName: u.role.name, isActive: u.isActive };
}

/** წაშლილის ტექსტი და ფაილები API-ში არ გადის (ბაზაში რჩება — აუდიტისთვის). */
export function toMessage(m: MessageRow): ChatMessage {
  const deleted = m.deletedAt !== null;
  return {
    id: Number(m.id),
    conversationId: m.conversationId,
    kind: m.kind,
    sender: toUserRef(m.sender),
    body: deleted ? null : m.body,
    event: (m.event as SystemEvent | null) ?? null,
    target: m.targetUser ? toUserRef(m.targetUser) : null,
    replyTo: m.replyTo
      ? {
          id: Number(m.replyTo.id),
          sender: toUserRef(m.replyTo.sender),
          text: m.replyTo.deletedAt ? "" : snippet(m.replyTo.body ?? "", QUOTE_LENGTH),
          deleted: m.replyTo.deletedAt !== null,
          hasAttachments: m.replyTo._count.attachments > 0,
        }
      : null,
    attachments: deleted
      ? []
      : m.attachments.map((a) => ({ id: Number(a.id), fileName: a.fileName, mimeType: a.mimeType, size: a.size, width: a.width, height: a.height })),
    clientId: m.clientId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted,
  };
}
