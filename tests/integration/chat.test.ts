/**
 * ჩატის ინტეგრაციული ტესტები რეალურ ბაზაზე (.env.local): წვდომა, წაუკითხავები, ისტორიის გვერდები, ცვლილებების ისტორია,
 * ძებნა, სტატუსები. ყოველი ტესტი ერთ ტრანზაქციაშია და ბოლოს უქმდება (ROLLBACK) — სატესტო თანამშრომლებიც.
 * გაშვება: npm run test:integration  (საჭიროა: npm run db:setup).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it, mock } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { MESSAGE_PAGE_SIZE } from "@/modules/chat/config";
import { PresenceStore } from "@/modules/chat/realtime/presence-store";
import { readAttachment } from "@/modules/chat/server/attachments";
import {
  addMembers,
  clearConversation,
  createGroup,
  getConversation,
  listConversations,
  openDirect,
  removeMember,
  renameGroup,
} from "@/modules/chat/server/conversations";
import { ChatError } from "@/modules/chat/server/errors";
import { deleteMessage, editMessage, listMessages, markRead, searchMessages, sendMessage } from "@/modules/chat/server/messages";
import { addFavorite, listFavorites, searchUsers } from "@/modules/chat/server/users";
import type { PresenceUpdate } from "@/modules/chat/types";

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

/** ტესტი ტრანზაქციაში, რომელიც ბოლოს ყოველთვის უქმდება. */
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { maxWait: 20_000, timeout: 90_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** ChatError კონკრეტული HTTP სტატუსით. */
const rejectsWith = (p: Promise<unknown>, status: number, what = "") =>
  assert.rejects(p, (e: unknown) => e instanceof ChatError && e.status === status, `მოსალოდნელი ${status} ${what}`);

/** სატესტო თანამშრომლები (ტრანზაქციაში — ბოლოს ქრება). */
async function staff(tx: Tx, count: number, opts: { inactive?: number[] } = {}) {
  const role = await tx.role.findFirstOrThrow({ where: { code: "nurse" }, select: { id: true } });
  const tag = randomUUID().slice(0, 8);
  const users = [];
  for (let i = 0; i < count; i++) {
    users.push(
      await tx.user.create({
        data: {
          username: `chat-${tag}-${i}`,
          passwordHash: "x",
          firstName: `ტესტ${i}`,
          lastName: `ჩატი${tag}`,
          roleId: role.id,
          isActive: !opts.inactive?.includes(i),
        },
        select: { id: true },
      }),
    );
  }
  return { ids: users.map((u) => u.id), tag };
}

const unreadOf = async (tx: Tx, userId: number, conversationId: number) =>
  (await listConversations(tx, userId)).find((c) => c.id === conversationId)?.unread;

after(() => prisma.$disconnect());

describe("ჩატი — წვდომა (უცხო საუბარს ვერ ხედავს)", () => {
  it("არამონაწილე: ყველა მოქმედება — 404, სიაში არ ჩანს", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b, outsider],
      } = await staff(tx, 3);
      const { conversationId } = await openDirect(tx, a, b);
      const { message } = await sendMessage(tx, a, conversationId, { body: "პაციენტის მონაცემები" });

      await rejectsWith(getConversation(tx, outsider, conversationId), 404, "getConversation");
      await rejectsWith(listMessages(tx, outsider, conversationId, {}), 404, "listMessages");
      await rejectsWith(searchMessages(tx, outsider, conversationId, "პაციენტ"), 404, "searchMessages");
      await rejectsWith(sendMessage(tx, outsider, conversationId, { body: "შემოჭრა" }), 404, "sendMessage");
      await rejectsWith(markRead(tx, outsider, conversationId, message.id), 404, "markRead");
      await rejectsWith(editMessage(tx, outsider, message.id, "შეცვლა"), 404, "editMessage");
      await rejectsWith(deleteMessage(tx, outsider, message.id), 404, "deleteMessage");
      assert.equal((await listConversations(tx, outsider)).length, 0);
      assert.equal((await listConversations(tx, b)).length, 1);
    }));

  it("ფაილი: უცხოს — 404 (დისკამდე არ მიდის); წაშლილი შეტყობინების ფაილი — 404 მონაწილესაც", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b, outsider],
      } = await staff(tx, 3);
      const { conversationId } = await openDirect(tx, a, b);
      const { message } = await sendMessage(tx, a, conversationId, {
        body: "",
        attachments: [{ fileName: "ანალიზი.pdf", mimeType: "application/pdf", size: 10, storagePath: "chat/test/none.pdf", width: null, height: null }],
      });
      const attachmentId = message.attachments[0].id;
      await rejectsWith(readAttachment(tx, outsider, attachmentId), 404, "უცხო");
      await deleteMessage(tx, a, message.id);
      await rejectsWith(readAttachment(tx, b, attachmentId), 404, "წაშლილი");
    }));

  it("ჯგუფი: მართავს მხოლოდ შემქმნელი; ამოშლილი კარგავს წვდომას; შემქმნელის გასვლისას ჯგუფი ძველ მონაწილეს გადაეცემა", () =>
    inRollback(async (tx) => {
      const {
        ids: [owner, m1, m2, extra],
      } = await staff(tx, 4);
      const { conversationId } = await createGroup(tx, owner, "მორიგეები", [m1, m2]);

      await rejectsWith(renameGroup(tx, m1, conversationId, "სხვა"), 403, "rename");
      await rejectsWith(addMembers(tx, m1, conversationId, [extra]), 403, "add");
      await rejectsWith(removeMember(tx, m1, conversationId, m2), 403, "remove");

      await removeMember(tx, owner, conversationId, m2);
      await rejectsWith(listMessages(tx, m2, conversationId, {}), 404, "ამოშლილი");
      // შეტყობინებები რჩება
      assert.ok((await listMessages(tx, owner, conversationId, {})).messages.some((m) => m.event === "member_removed"));

      await removeMember(tx, owner, conversationId, owner);
      const detail = await getConversation(tx, m1, conversationId);
      assert.equal(detail.role, "owner");
      assert.deepEqual(detail.members.map((m) => m.id), [m1]);
    }));

  it("გათიშული თანამშრომელი: ძებნაში/Favorites-ში არ ჩანს, ვერ მისწერ, ვერ დაამატებ; ძველი შეტყობინებები რჩება", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b, off],
        tag,
      } = await staff(tx, 3);
      const { conversationId } = await openDirect(tx, a, off);
      await sendMessage(tx, a, conversationId, { body: "ძველი" });
      await addFavorite(tx, a, off);
      await tx.user.update({ where: { id: off }, data: { isActive: false } });

      const found = await searchUsers(tx, a, `ჩატი${tag}`);
      assert.deepEqual(found.map((u) => u.id), [b]);
      assert.deepEqual(await searchUsers(tx, a, "%"), [], "„%“ — ჩვეულებრივი სიმბოლო, არა „ყველა“");
      assert.deepEqual((await searchUsers(tx, a, `ტესტ1 ჩატი${tag.toUpperCase()}`)).map((u) => u.id), [b], "რამდენიმე სიტყვა, რეგისტრის მიუხედავად");
      assert.equal((await listFavorites(tx, a)).length, 0);
      await rejectsWith(sendMessage(tx, a, conversationId, { body: "ახალი" }), 409, "გათიშულს");
      await rejectsWith(openDirect(tx, b, off), 409, "ახალი საუბარი გათიშულთან");
      await rejectsWith(createGroup(tx, a, "ჯგუფი", [b, off]), 409, "ჯგუფი გათიშულით");
      assert.equal((await listMessages(tx, a, conversationId, {})).messages[0].body, "ძველი");
    }));

  it("სხვისი შეტყობინება — 403; სისტემური — 403", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b],
      } = await staff(tx, 2);
      const { conversationId, message: system } = await createGroup(tx, a, "ჯგუფი", [b]);
      const { message } = await sendMessage(tx, a, conversationId, { body: "ჩემი" });
      await rejectsWith(editMessage(tx, b, message.id, "სხვისი"), 403);
      await rejectsWith(deleteMessage(tx, b, message.id), 403);
      await rejectsWith(editMessage(tx, a, system.id, "სისტემური"), 403);
    }));
});

describe("ჩატი — პირადი საუბარი", () => {
  it("ორ ადამიანს შორის ერთი (ორივე მხრიდან); საკუთარ თავთან — არა; ცარიელი ჩანს მხოლოდ შემქმნელს", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b],
      } = await staff(tx, 2);
      const first = await openDirect(tx, a, b);
      assert.equal(first.created, true);
      assert.deepEqual(await openDirect(tx, a, b), { conversationId: first.conversationId, created: false });
      assert.deepEqual(await openDirect(tx, b, a), { conversationId: first.conversationId, created: false });
      await rejectsWith(openDirect(tx, a, a), 400);

      assert.equal((await listConversations(tx, a)).length, 1);
      assert.equal((await listConversations(tx, b)).length, 0, "პირველ შეტყობინებამდე მეორეს არ უჩანს");
      await sendMessage(tx, a, first.conversationId, { body: "გამარჯობა" });
      assert.equal((await listConversations(tx, b)).length, 1);
    }));
});

describe("ჩატი — წაუკითხავების დათვლა (last_read_message_id)", () => {
  it("სხვისი ითვლება, საკუთარი — არა; წაკითხვა ნაწილობრივ / ბოლომდე; პასუხი = წაკითხულია", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b],
      } = await staff(tx, 2);
      const { conversationId } = await openDirect(tx, a, b);
      const sent = [];
      for (const body of ["ერთი", "ორი", "სამი"]) sent.push((await sendMessage(tx, a, conversationId, { body })).message);

      assert.equal(await unreadOf(tx, b, conversationId), 3);
      assert.equal(await unreadOf(tx, a, conversationId), 0);

      assert.equal((await markRead(tx, b, conversationId, sent[1].id)).lastReadMessageId, sent[1].id);
      assert.equal(await unreadOf(tx, b, conversationId), 1);
      // უკან არ ბრუნდება
      assert.equal((await markRead(tx, b, conversationId, sent[0].id)).changed, false);
      assert.equal(await unreadOf(tx, b, conversationId), 1);
      // საუბრის ბოლო შეტყობინებაზე მეტი არ იწერება
      assert.equal((await markRead(tx, b, conversationId, sent[2].id + 1_000_000)).lastReadMessageId, sent[2].id);
      assert.equal(await unreadOf(tx, b, conversationId), 0);

      await sendMessage(tx, a, conversationId, { body: "ოთხი" });
      assert.equal(await unreadOf(tx, b, conversationId), 1);
      await sendMessage(tx, b, conversationId, { body: "პასუხი" });
      assert.equal(await unreadOf(tx, b, conversationId), 0, "საკუთარი შეტყობინება = წინა წაკითხულია");
      assert.equal(await unreadOf(tx, a, conversationId), 1);
    }));

  it("ჯგუფი: შექმნა და ახალი მონაწილე — ძველი ისტორია წაუკითხავად არ ითვლება, ახალი — ითვლება; ✓✓ მონაწილეების მიხედვით", () =>
    inRollback(async (tx) => {
      const {
        ids: [owner, m1, late],
      } = await staff(tx, 3);
      const { conversationId } = await createGroup(tx, owner, "ჯგუფი", [m1]);
      assert.equal(await unreadOf(tx, m1, conversationId), 0, "„ჯგუფი შეიქმნა“ არ ითვლება");
      const { message } = await sendMessage(tx, owner, conversationId, { body: "მოგესალმებით" });
      assert.equal(await unreadOf(tx, m1, conversationId), 1);

      await addMembers(tx, owner, conversationId, [late]);
      assert.equal(await unreadOf(tx, late, conversationId), 0);
      assert.ok((await listMessages(tx, late, conversationId, {})).messages.some((m) => m.body === "მოგესალმებით"), "ისტორია ჩანს");
      await sendMessage(tx, owner, conversationId, { body: "ახალი" });
      assert.equal(await unreadOf(tx, late, conversationId), 1);

      await markRead(tx, m1, conversationId, message.id);
      const members = (await getConversation(tx, owner, conversationId)).members;
      const readBy = members.filter((m) => m.id !== owner && m.lastReadMessageId >= message.id).map((m) => m.id);
      assert.deepEqual(readBy.sort(), [m1, late].sort(), "წაიკითხა: m1 (მონიშნა) და late (დაემატა შემდეგ)");
    }));

  it("სია: ბოლო შეტყობინების ნაწყვეტი, დალაგება ბოლო აქტივობით, ჩამაგრებული — პირველი", () =>
    inRollback(async (tx) => {
      const {
        ids: [me, x, y],
      } = await staff(tx, 3);
      const cx = (await openDirect(tx, me, x)).conversationId;
      const cy = (await openDirect(tx, me, y)).conversationId;
      await sendMessage(tx, x, cx, { body: "ძველი" });
      await sendMessage(tx, y, cy, { body: "ახალი\nხაზით" });
      let list = await listConversations(tx, me);
      assert.deepEqual(list.map((c) => c.id), [cy, cx]);
      assert.equal(list[0].lastMessage?.text, "ახალი ხაზით");
      await tx.conversationMember.update({ where: { conversationId_userId: { conversationId: cx, userId: me } }, data: { pinned: true } });
      list = await listConversations(tx, me);
      assert.deepEqual(list.map((c) => c.id), [cx, cy]);
    }));
});

describe("ჩატი — საუბრის წაშლა ჩემთვის", () => {
  it("ქრება სიიდან და ისტორიიდან მხოლოდ ჩემთვის; მეორეს რჩება; ახალ შეტყობინებაზე ჩნდება — მხოლოდ ახლით", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b, outsider],
      } = await staff(tx, 3);
      const { conversationId } = await openDirect(tx, a, b);
      await sendMessage(tx, a, conversationId, { body: "ძველი 1" });
      const { message: old } = await sendMessage(tx, b, conversationId, {
        body: "ძველი 2",
        attachments: [{ fileName: "a.pdf", mimeType: "application/pdf", size: 1, storagePath: "chat/test/none.pdf", width: null, height: null }],
      });
      await rejectsWith(clearConversation(tx, outsider, conversationId), 404, "უცხო");

      await clearConversation(tx, a, conversationId);
      assert.equal((await listConversations(tx, a)).length, 0, "სიიდან გაქრა");
      assert.equal((await listMessages(tx, a, conversationId, {})).messages.length, 0);
      assert.equal((await searchMessages(tx, a, conversationId, "ძველი")).messages.length, 0);
      await rejectsWith(readAttachment(tx, a, old.attachments[0].id), 404, "ძველი ფაილი");
      // მეორე მხარეს — უცვლელი; ბაზაში — ყველაფერი
      assert.equal((await listMessages(tx, b, conversationId, {})).messages.length, 2);
      assert.equal(await tx.message.count({ where: { conversationId } }), 2);
      // ხელახლა გახსნა — იგივე საუბარი, ძველი ნაწყვეტის გარეშე
      assert.deepEqual(await openDirect(tx, a, b), { conversationId, created: false });
      assert.equal((await getConversation(tx, a, conversationId)).lastMessage, null);

      const { message: fresh } = await sendMessage(tx, b, conversationId, { body: "ახალი" });
      const list = await listConversations(tx, a);
      assert.equal(list.length, 1, "ახალ შეტყობინებაზე ისევ ჩანს");
      assert.equal(list[0].unread, 1);
      assert.equal(list[0].lastMessage?.text, "ახალი");
      assert.deepEqual((await listMessages(tx, a, conversationId, {})).messages.map((m) => m.id), [fresh.id]);
      assert.equal((await listMessages(tx, a, conversationId, { around: old.id })).messages.every((m) => m.id > old.id), true);
      assert.equal((await listMessages(tx, a, conversationId, {})).hasMoreBefore, false);
    }));

  it("ჯგუფი: წაშლის შემდეგ მონაწილედ რჩება (ახალს იღებს), სხვები ისტორიას ხედავენ", () =>
    inRollback(async (tx) => {
      const {
        ids: [owner, m1],
      } = await staff(tx, 2);
      const { conversationId } = await createGroup(tx, owner, "ჯგუფი", [m1]);
      await sendMessage(tx, owner, conversationId, { body: "ძველი" });
      await clearConversation(tx, m1, conversationId);
      assert.equal((await listConversations(tx, m1)).length, 0);
      assert.ok((await getConversation(tx, owner, conversationId)).members.some((m) => m.id === m1), "მონაწილედ რჩება");
      await sendMessage(tx, owner, conversationId, { body: "ახალი" });
      assert.deepEqual((await listMessages(tx, m1, conversationId, {})).messages.map((m) => m.body), ["ახალი"]);
      assert.equal((await listMessages(tx, owner, conversationId, {})).messages.filter((m) => m.kind === "text").length, 2);
    }));
});

describe("ჩატი — ისტორია ნაწილ-ნაწილ (cursor pagination)", () => {
  it("120 შეტყობინება: ბოლო გვერდი, before / after / around — გამოტოვებისა და გამეორების გარეშე", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b],
      } = await staff(tx, 2);
      const { conversationId } = await openDirect(tx, a, b);
      const base = Date.now();
      await tx.message.createMany({
        data: Array.from({ length: 120 }, (_, i) => ({ conversationId, senderId: i % 2 ? a : b, body: `#${i + 1}`, createdAt: new Date(base + i) })),
      });
      const all = (await tx.message.findMany({ where: { conversationId }, orderBy: { id: "asc" }, select: { id: true } })).map((m) => Number(m.id));
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageId: BigInt(all.at(-1)!), lastMessageAt: new Date() } });

      const last = await listMessages(tx, a, conversationId, {});
      assert.equal(last.messages.length, MESSAGE_PAGE_SIZE);
      assert.deepEqual(last.messages.map((m) => m.id), all.slice(-MESSAGE_PAGE_SIZE), "ზრდადი რიგით, ბოლო 50");
      assert.equal(last.hasMoreBefore, true);

      // ზემოთ სქროლვა ბოლომდე — ყველა ერთხელ
      const seen = [...last.messages.map((m) => m.id)];
      let page = last;
      while (page.hasMoreBefore) {
        page = await listMessages(tx, a, conversationId, { before: page.messages[0].id });
        seen.unshift(...page.messages.map((m) => m.id));
      }
      assert.deepEqual(seen, all);

      const after = await listMessages(tx, b, conversationId, { after: all[99] });
      assert.deepEqual(after.messages.map((m) => m.id), all.slice(100));
      assert.equal(after.hasMoreAfter, false);
      const afterLimited = await listMessages(tx, b, conversationId, { after: all[9], limit: 20 });
      assert.deepEqual(afterLimited.messages.map((m) => m.id), all.slice(10, 30));
      assert.equal(afterLimited.hasMoreAfter, true);

      const around = await listMessages(tx, b, conversationId, { around: all[59], limit: 10 });
      assert.deepEqual(around.messages.map((m) => m.id), all.slice(55, 65));
      assert.equal(around.hasMoreBefore && around.hasMoreAfter, true);
      assert.equal((await unreadOf(tx, b, conversationId)) ?? 0, 120);
    }));
});

describe("ჩატი — რედაქტირება, წაშლა, ძებნა", () => {
  it("ძველი ტექსტი ინახება message_revisions-ში; წაშლილი — body null API-ში, ბაზაში რჩება; ციტატა იცნობს წაშლას", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b],
      } = await staff(tx, 2);
      const { conversationId } = await openDirect(tx, a, b);
      const { message } = await sendMessage(tx, a, conversationId, { body: "პირველი ვერსია" });
      const { message: reply } = await sendMessage(tx, b, conversationId, { body: "პასუხი", replyToId: message.id });
      assert.equal(reply.replyTo?.text, "პირველი ვერსია");

      const edited = await editMessage(tx, a, message.id, "მეორე ვერსია");
      assert.ok(edited.editedAt);
      const deleted = await deleteMessage(tx, a, message.id);
      assert.equal(deleted.deleted, true);
      assert.equal(deleted.body, null);

      const revisions = await tx.messageRevision.findMany({ where: { messageId: BigInt(message.id) }, orderBy: { id: "asc" } });
      assert.deepEqual(revisions.map((r) => [r.action, r.oldBody, r.userId]), [
        ["edit", "პირველი ვერსია", a],
        ["delete", "მეორე ვერსია", a],
      ]);
      assert.equal((await tx.message.findUniqueOrThrow({ where: { id: BigInt(message.id) } })).body, "მეორე ვერსია", "ფიზიკურად არ იშლება");
      const page = await listMessages(tx, b, conversationId, {});
      assert.equal(page.messages.find((m) => m.id === reply.id)?.replyTo?.deleted, true);
      await rejectsWith(editMessage(tx, a, message.id, "ისევ"), 409, "წაშლილის შეცვლა");
    }));

  it("ძებნა: რეგისტრის მიუხედავად, %/_ — ჩვეულებრივი სიმბოლოა, წაშლილი არ მოიძებნება", () =>
    inRollback(async (tx) => {
      const {
        ids: [a, b],
      } = await staff(tx, 2);
      const { conversationId } = await openDirect(tx, a, b);
      const hit = (await sendMessage(tx, a, conversationId, { body: "ფასდაკლება 50% — Analysis_A" })).message;
      await sendMessage(tx, a, conversationId, { body: "ფასდაკლება 50 ლარი" });
      const gone = (await sendMessage(tx, a, conversationId, { body: "წასაშლელი ANALYSIS" })).message;
      await deleteMessage(tx, a, gone.id);

      assert.deepEqual((await searchMessages(tx, b, conversationId, "50%")).messages.map((m) => m.id), [hit.id]);
      assert.deepEqual((await searchMessages(tx, b, conversationId, "s_a")).messages.map((m) => m.id), [hit.id]);
      assert.deepEqual((await searchMessages(tx, b, conversationId, "analysis")).messages.map((m) => m.id), [hit.id]);
    }));
});

describe("ჩატი — სტატუსები (PresenceStore, ვირტუალური დრო)", () => {
  const AWAY = 5 * 60_000;

  function setup() {
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000_000_000 });
    const events: PresenceUpdate[] = [];
    const persisted: { userId: number; lastSeenAt?: Date; lastActiveAt?: Date }[] = [];
    const io = { emit: (_e: string, p: PresenceUpdate) => events.push(p) } as unknown as ConstructorParameters<typeof PresenceStore>[0];
    const store = new PresenceStore(io, AWAY, async (userId, data) => {
      persisted.push({ userId, ...data });
    });
    const statuses = () => events.map((e) => e.status);
    return { store, events, persisted, statuses, done: () => (store.stop(), mock.timers.reset()) };
  }

  it("აქტიური → (5 წთ უმოქმედობა) არ არის კომპიუტერთან → აქტივობა → აქტიური; ერთი აქტიური ტაბი საკმარისია", () => {
    const { store, statuses, done } = setup();
    try {
      store.connect(1, "tab-a", Date.now(), null);
      store.connect(1, "tab-b", Date.now() - 60 * 60_000, null); // ძველი, უმოქმედო ტაბი
      assert.deepEqual(statuses(), ["online"]);
      mock.timers.tick(AWAY - 30_000);
      assert.equal(store.get(1), "online");
      mock.timers.tick(45_000); // sweep 15 წამში ერთხელ
      assert.equal(store.get(1), "away");
      store.activity(1, "tab-b");
      assert.deepEqual(statuses(), ["online", "away", "online"]);
    } finally {
      done();
    }
  });

  it("„არ შემაწუხოთ“ — სანამ შესულია; snapshot-ში ჩანს", () => {
    const { store, done } = setup();
    try {
      store.connect(2, "t", Date.now(), "dnd");
      assert.equal(store.get(2), "dnd");
      assert.deepEqual(store.snapshot(), [{ userId: 2, status: "dnd", lastSeenAt: null }]);
      store.setManual(2, null);
      assert.equal(store.get(2), "online");
    } finally {
      done();
    }
  });

  it("ბოლო ტაბის დახურვა → 5 წმ-ში გასულია (ბოლოს იყო); განახლება 5 წმ-ში — გასვლა არ ჩანს; გასვლა / სესიის ვადა — მაშინვე", () => {
    const { store, events, persisted, statuses, done } = setup();
    try {
      store.connect(3, "a", Date.now(), null);
      store.disconnect(3, "a", false);
      mock.timers.tick(3_000);
      store.connect(3, "b", Date.now(), null); // გვერდის განახლება
      mock.timers.tick(20_000);
      assert.deepEqual(statuses(), ["online"], "განახლებისას ⚪ არ გამოჩნდა");

      store.disconnect(3, "b", false);
      mock.timers.tick(4_999);
      assert.equal(store.get(3), "online");
      mock.timers.tick(1);
      assert.equal(store.get(3), "offline");
      const offline = events.at(-1)!;
      assert.equal(offline.status, "offline");
      assert.equal(offline.lastSeenAt, new Date(Date.now()).toISOString());
      assert.ok(persisted.some((p) => p.userId === 3 && p.lastSeenAt));

      store.connect(3, "c", Date.now(), null);
      store.disconnect(3, "c", true); // გასვლა
      assert.equal(store.get(3), "offline");
      assert.deepEqual(statuses(), ["online", "offline", "online", "offline"]);
    } finally {
      done();
    }
  });
});
