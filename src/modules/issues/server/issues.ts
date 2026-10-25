import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { userWithRole } from "@/lib/user-roles";
import { isImageMime } from "@/modules/chat/files";
import { currentYear, formatDateTime, fullName } from "@/modules/finance/server/db";
import { nextNumber } from "@/modules/finance/server/numbering";
import { FINAL_STATUSES, type IssuePriorityValue, type IssueStatusValue, OPEN_STATUSES, priorityLabel, statusLabel } from "@/modules/issues/labels";
import { availableActions, canDo, canRoute, ISSUE_ACTIONS, type IssueAction } from "@/modules/issues/rules";
import type { issueSchema, routeSchema } from "@/modules/issues/schema";
import { actorOf, type IssueUser, visibleWhere, workerWhere } from "@/modules/issues/server/access";
import { type Db, IssueError } from "@/modules/issues/server/db";
import type { StoredIssueFile } from "@/modules/issues/server/files";
import type {
  IssueAttachmentItem,
  IssueCategoryOption,
  IssueDetail,
  IssueFilter,
  IssueListRow,
  IssueStatusFilter,
  IssueTabs,
  IssueTimelineItem,
} from "@/modules/issues/types";
import type { z } from "zod";

/**
 * ბილეთები: შექმნა, სტატუსის ცვლილება, კომენტარი, გადაცემა, სია და დეტალები. ბილეთი არ იშლება;
 * ყოველი ცვლილება issue_events-ში იწერება. შეტყობინებები — იმავე ტრანზაქციაში (ზარი).
 */

const issueLink = (id: number) => `/issues/${id}`;

/** აქტიური მომხმარებლები ამ როლით (მთავარი ან დამატებითი). */
async function roleMembers(db: Db, roleId: number | null): Promise<number[]> {
  if (!roleId) return [];
  const users = await db.user.findMany({ where: { isActive: true, ...userWithRole({ id: roleId }) }, select: { id: true } });
  return users.map((u) => u.id);
}

async function notifyUsers(db: Db, userIds: Iterable<number>, exceptId: number, n: { title: string; body?: string | null; link: string; type: "issue_new" | "issue_update" }) {
  for (const userId of new Set(userIds)) {
    if (userId !== exceptId) await notify(db, { userId, ...n });
  }
}

/** ბილეთის მონაწილეები: ავტორი და შემსრულებელი (თუ ჯერ არავინ აიღო — კატეგორიის როლის წევრები). */
async function participants(db: Db, issue: { createdById: number; assigneeId: number | null; assigneeRoleId: number | null }) {
  return [issue.createdById, ...(issue.assigneeId ? [issue.assigneeId] : await roleMembers(db, issue.assigneeRoleId))];
}

/** ბილეთის ჩაკეტვა ტრანზაქციის ბოლომდე + წაკითხვა (მხოლოდ თუ მომხმარებელი ხედავს). */
async function lockIssue(tx: Db, u: IssueUser, issueId: number) {
  await tx.$queryRaw`SELECT id FROM issues WHERE id = ${issueId} FOR UPDATE`;
  const issue = await tx.issue.findFirst({
    where: { id: issueId, ...visibleWhere(u) },
    select: {
      id: true,
      issueNumber: true,
      title: true,
      status: true,
      priority: true,
      categoryId: true,
      createdById: true,
      assigneeId: true,
      assigneeRoleId: true,
      category: { select: { name: true } },
      assignee: { select: { firstName: true, lastName: true } },
    },
  });
  if (!issue) throw new IssueError("ბილეთი ვერ მოიძებნა");
  return issue;
}

async function userName(db: Db, id: number) {
  return fullName(await db.user.findUnique({ where: { id }, select: { firstName: true, lastName: true } })) ?? "";
}

async function addEvent(db: Db, issueId: number, userId: number, event: string, from: string | null, to: string | null) {
  await db.issueEvent.create({ data: { issueId, userId, event, fromValue: from?.slice(0, 200) ?? null, toValue: to?.slice(0, 200) ?? null, createdAt: new Date() } });
}

async function addFiles(db: Db, issueId: number, commentId: number | null, userId: number, files: StoredIssueFile[]) {
  if (!files.length) return;
  await db.issueAttachment.createMany({
    data: files.map((f) => ({ issueId, commentId, uploadedById: userId, createdAt: new Date(), ...f })),
  });
}

/** ახალი ბილეთი: მიდის კატეგორიის როლზე; სასწრაფოს ადმინიც იღებს შეტყობინებას. */
export async function createIssue(
  tx: Db,
  input: z.output<typeof issueSchema>,
  files: StoredIssueFile[],
  u: IssueUser,
  roleCode: string,
): Promise<{ id: number; number: string }> {
  const category = await tx.issueCategory.findFirst({ where: { id: input.categoryId, isActive: true }, select: { name: true, assigneeRoleId: true } });
  if (!category) throw new IssueError("კატეგორია ვერ მოიძებნა — განაახლეთ გვერდი", { categoryId: "აირჩიეთ კატეგორია" });

  const number = await nextNumber(tx, "ISS", currentYear());
  const now = new Date();
  const issue = await tx.issue.create({
    data: {
      issueNumber: number,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      priority: input.priority as IssuePriorityValue,
      location: input.location,
      sourcePath: input.sourcePath,
      createdById: u.id,
      createdRoleCode: roleCode,
      assigneeRoleId: category.assigneeRoleId,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  await addFiles(tx, issue.id, null, u.id, files);
  await addEvent(tx, issue.id, u.id, "created", null, null);

  const urgent = input.priority === "urgent";
  const admins = urgent
    ? (await tx.user.findMany({ where: { isActive: true, ...userWithRole({ code: "admin" }) }, select: { id: true } })).map((a) => a.id)
    : [];
  await notifyUsers(tx, [...(await roleMembers(tx, category.assigneeRoleId)), ...admins], u.id, {
    type: "issue_new",
    title: `${urgent ? "სასწრაფო — " : ""}ახალი პრობლემა: ${input.title}`,
    body: `${number} · ${category.name} · ${await userName(tx, u.id)}`,
    link: issueLink(issue.id),
  });
  return { id: issue.id, number };
}

const needsText = (action: IssueAction) => ISSUE_ACTIONS[action].text === "required";

const TEXT_REQUIRED: Partial<Record<IssueAction, string>> = {
  wait: "მიუთითეთ, რას ელოდება",
  resolve: "დაწერეთ, რა გაკეთდა",
  reject: "მიუთითეთ უარის მიზეზი",
  reopen: "დაწერეთ, რა არ მოგვარდა",
};

/** სტატუსის ცვლილება (rules.ts): ტექსტი კომენტარად იწერება, გადაწყვეტა/უარი — resolution-შიც. */
export async function applyIssueAction(tx: Db, issueId: number, action: IssueAction, text: string | null, u: IssueUser): Promise<string> {
  const issue = await lockIssue(tx, u, issueId);
  const actor = actorOf(u, issue);
  if (!canDo(action, issue.status, actor, issue.assigneeId)) throw new IssueError("ეს მოქმედება ამ ბილეთზე ახლა შეუძლებელია — განაახლეთ გვერდი");
  if (needsText(action) && !text) throw new IssueError(TEXT_REQUIRED[action] ?? "შეავსეთ ტექსტი", { text: TEXT_REQUIRED[action] ?? "შეავსეთ ტექსტი" });

  const to = ISSUE_ACTIONS[action].to as IssueStatusValue;
  const now = new Date();
  const data: Prisma.IssueUncheckedUpdateInput = { status: to, updatedAt: now };
  if (action === "take") data.assigneeId = u.id;
  if (action === "resolve") Object.assign(data, { resolution: text, resolvedAt: now });
  if (action === "reject") Object.assign(data, { resolution: text, closedAt: now });
  if (action === "confirm" || action === "withdraw") data.closedAt = now;
  if (action === "reopen") Object.assign(data, { resolution: null, resolvedAt: null });
  await tx.issue.update({ where: { id: issue.id }, data });

  const me = await userName(tx, u.id);
  if (issue.status !== to) await addEvent(tx, issue.id, u.id, "status", issue.status, to);
  if (action === "take" && issue.assigneeId !== u.id) await addEvent(tx, issue.id, u.id, "assigned", fullName(issue.assignee), me);
  if (text) await tx.issueComment.create({ data: { issueId: issue.id, userId: u.id, body: text, createdAt: now } });

  await notifyUsers(tx, await participants(tx, { ...issue, assigneeId: action === "take" ? u.id : issue.assigneeId }), u.id, {
    type: "issue_update",
    title: action === "take" ? `${issue.issueNumber}: ბილეთი აიღო ${me}` : `${issue.issueNumber}: ${statusLabel(to)}`,
    body: text ? `${issue.title} — ${text.slice(0, 150)}` : issue.title,
    link: issueLink(issue.id),
  });
  return action === "take" ? "ბილეთი თქვენზეა" : `სტატუსი: ${statusLabel(to)}`;
}

export async function addIssueComment(tx: Db, issueId: number, body: string, files: StoredIssueFile[], u: IssueUser) {
  if (!body && !files.length) throw new IssueError("დაწერეთ კომენტარი ან დაურთეთ ფაილი", { body: "დაწერეთ კომენტარი" });
  const issue = await lockIssue(tx, u, issueId);
  const now = new Date();
  const comment = await tx.issueComment.create({ data: { issueId: issue.id, userId: u.id, body, createdAt: now }, select: { id: true } });
  await addFiles(tx, issue.id, comment.id, u.id, files);
  await tx.issue.update({ where: { id: issue.id }, data: { updatedAt: now } });
  await notifyUsers(tx, await participants(tx, issue), u.id, {
    type: "issue_update",
    title: `${issue.issueNumber}: ახალი კომენტარი`,
    body: `${await userName(tx, u.id)}: ${body ? body.slice(0, 150) : "ფაილი"}`,
    link: issueLink(issue.id),
  });
}

/** გადაცემა: კატეგორია (→ მიმღები როლი), პრიორიტეტი, შემსრულებელი. ახალ მიმღებს შეტყობინება მიდის. */
export async function routeIssue(tx: Db, input: z.output<typeof routeSchema>, u: IssueUser): Promise<string> {
  const issue = await lockIssue(tx, u, input.issueId);
  if (!canRoute(issue.status, actorOf(u, issue))) throw new IssueError("ბილეთის გადაცემა ახლა შეუძლებელია — განაახლეთ გვერდი");

  const data: Prisma.IssueUncheckedUpdateInput = {};
  let notifyRoleId: number | null = null;
  if (input.categoryId !== issue.categoryId) {
    const category = await tx.issueCategory.findFirst({ where: { id: input.categoryId, isActive: true }, select: { name: true, assigneeRoleId: true } });
    if (!category) throw new IssueError("კატეგორია ვერ მოიძებნა", { categoryId: "აირჩიეთ კატეგორია" });
    Object.assign(data, { categoryId: input.categoryId, assigneeRoleId: category.assigneeRoleId });
    await addEvent(tx, issue.id, u.id, "category", issue.category.name, category.name);
    if (category.assigneeRoleId !== issue.assigneeRoleId) notifyRoleId = category.assigneeRoleId;
  }
  if (input.priority !== issue.priority) {
    data.priority = input.priority as IssuePriorityValue;
    await addEvent(tx, issue.id, u.id, "priority", issue.priority, input.priority);
  }
  let newAssignee: number | null = null;
  if (input.assigneeId !== issue.assigneeId) {
    if (input.assigneeId) {
      const user = await tx.user.findFirst({ where: { id: input.assigneeId, isActive: true }, select: { firstName: true, lastName: true } });
      if (!user) throw new IssueError("მომხმარებელი ვერ მოიძებნა ან გათიშულია", { assigneeId: "აირჩიეთ შემსრულებელი" });
      await addEvent(tx, issue.id, u.id, "assigned", fullName(issue.assignee), fullName(user));
      newAssignee = input.assigneeId;
    } else {
      await addEvent(tx, issue.id, u.id, "assigned", fullName(issue.assignee), null);
    }
    data.assigneeId = input.assigneeId;
  }
  if (!Object.keys(data).length) return "ცვლილება არ არის";
  await tx.issue.update({ where: { id: issue.id }, data: { ...data, updatedAt: new Date() } });

  const recipients = [...(newAssignee ? [newAssignee] : []), ...(!newAssignee && !input.assigneeId ? await roleMembers(tx, notifyRoleId) : [])];
  await notifyUsers(tx, recipients, u.id, {
    type: "issue_new",
    title: `${issue.issueNumber}: ბილეთი გადმოგეცათ`,
    body: issue.title,
    link: issueLink(issue.id),
  });
  return "ცვლილებები შენახულია";
}

// ─── წაკითხვა ───

const STATUS_FILTERS: Record<IssueStatusFilter, IssueStatusValue[] | null> = {
  open: OPEN_STATUSES,
  resolved: ["resolved"],
  done: FINAL_STATUSES,
  all: null,
};

export const ISSUES_PAGE_SIZE = 50;

function listWhere(u: IssueUser, f: IssueFilter): Prisma.IssueWhereInput {
  const statuses = STATUS_FILTERS[f.status];
  const view: Prisma.IssueWhereInput = f.view === "mine" ? { createdById: u.id } : f.view === "assigned" ? workerWhere(u) : {};
  return {
    AND: [
      visibleWhere(u),
      view,
      statuses ? { status: { in: statuses } } : {},
      f.categoryId ? { categoryId: f.categoryId } : {},
      f.priority ? { priority: f.priority } : {},
    ],
  };
}

export async function listIssues(u: IssueUser, f: IssueFilter): Promise<{ rows: IssueListRow[]; total: number }> {
  const where = listWhere(u, f);
  const [total, rows] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      // ღია ბილეთები: ჯერ სასწრაფო (ENUM-ის რიგით normal < high < urgent), მერე ახალი
      orderBy: f.status === "open" ? [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }] : [{ createdAt: "desc" }, { id: "desc" }],
      skip: (f.page - 1) * ISSUES_PAGE_SIZE,
      take: ISSUES_PAGE_SIZE,
      select: {
        id: true,
        issueNumber: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        category: { select: { name: true, isConfidential: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        assignee: { select: { firstName: true, lastName: true } },
        assigneeRole: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
  ]);
  return {
    total,
    rows: rows.map((i) => ({
      id: i.id,
      number: i.issueNumber,
      title: i.title,
      status: i.status,
      priority: i.priority,
      category: i.category.name,
      confidential: i.category.isConfidential,
      createdBy: fullName(i.createdBy)!,
      createdAt: formatDateTime(i.createdAt),
      assignee: fullName(i.assignee),
      assigneeRole: i.assigneeRole?.name ?? null,
      comments: i._count.comments,
    })),
  };
}

/** ჩანართები: ღია ბილეთების რაოდენობა. assigned — მხოლოდ თუ რომელიმე კატეგორია ჩემს როლზეა ან რამე მომიწერეს. */
export async function issueTabs(u: IssueUser): Promise<IssueTabs> {
  const open = { status: { in: OPEN_STATUSES } };
  const [mine, assigned, worksSomewhere, all] = await Promise.all([
    prisma.issue.count({ where: { createdById: u.id, status: { in: [...OPEN_STATUSES, "resolved"] } } }),
    prisma.issue.count({ where: { AND: [workerWhere(u), open] } }),
    u.isManager || (u.roleIds.length > 0 && (await prisma.issueCategory.count({ where: { assigneeRoleId: { in: u.roleIds } } })) > 0),
    u.isManager || u.viewsAll ? prisma.issue.count({ where: { AND: [visibleWhere(u), open] } }) : null,
  ]);
  return { mine, assigned: worksSomewhere || assigned > 0 ? assigned : null, all };
}

export async function activeCategories(db: Db = prisma): Promise<IssueCategoryOption[]> {
  return db.issueCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isConfidential: true },
  });
}

/** ისტორიაში სტატუსი/პრიორიტეტი კოდით ინახება — ეკრანზე წარწერით. */
const statusText = (v: string | null) => (v ? (statusLabel(v as IssueStatusValue) ?? v) : null);
const priorityText = (v: string | null) => (v ? (priorityLabel(v as IssuePriorityValue) ?? v) : null);

const attachmentItem = (a:{ id: number; fileName: string; mimeType: string; size: number }): IssueAttachmentItem => ({
  id: a.id,
  fileName: a.fileName,
  mimeType: a.mimeType,
  size: a.size,
  image: isImageMime(a.mimeType),
});

export async function loadIssueDetail(id: number, u: IssueUser): Promise<IssueDetail | null> {
  const i = await prisma.issue.findFirst({
    where: { id, ...visibleWhere(u) },
    include: {
      category: { select: { id: true, name: true, isConfidential: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      assignee: { select: { id: true, firstName: true, lastName: true } },
      assigneeRole: { select: { name: true } },
      attachments: { where: { commentId: null }, orderBy: { id: "asc" } },
      comments: {
        orderBy: { id: "asc" },
        include: { user: { select: { firstName: true, lastName: true } }, attachments: { orderBy: { id: "asc" } } },
      },
      events: { orderBy: { id: "asc" }, include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!i) return null;

  const actor = actorOf(u, i);
  const role = i.createdRoleCode ? await prisma.role.findUnique({ where: { code: i.createdRoleCode }, select: { name: true } }) : null;
  const timeline: { ts: number; item: IssueTimelineItem }[] = [
    ...i.comments.map((c) => ({
      ts: c.createdAt.getTime(),
      item: {
        kind: "comment" as const,
        key: `c${c.id}`,
        at: formatDateTime(c.createdAt),
        user: fullName(c.user),
        body: c.body,
        attachments: c.attachments.map(attachmentItem),
      },
    })),
    ...i.events
      .filter((e) => e.event !== "created")
      .map((e) => ({
        ts: e.createdAt.getTime(),
        item: {
          kind: "event" as const,
          key: `e${e.id}`,
          at: formatDateTime(e.createdAt),
          user: fullName(e.user),
          event: e.event,
          from: e.event === "status" ? statusText(e.fromValue) : e.event === "priority" ? priorityText(e.fromValue) : e.fromValue,
          to: e.event === "status" ? statusText(e.toValue) : e.event === "priority" ? priorityText(e.toValue) : e.toValue,
        },
      })),
  ];
  // ერთ წამში: ჯერ მოვლენა (სტატუსი), მერე მისი ტექსტი (კომენტარი)
  timeline.sort((a, b) => a.ts - b.ts || (a.item.kind === b.item.kind ? 0 : a.item.kind === "event" ? -1 : 1));

  const routable = canRoute(i.status, actor);
  return {
    id: i.id,
    number: i.issueNumber,
    title: i.title,
    description: i.description,
    status: i.status,
    priority: i.priority,
    category: i.category,
    location: i.location,
    sourcePath: i.sourcePath,
    createdBy: { name: fullName(i.createdBy)!, role: role?.name ?? null },
    createdAt: formatDateTime(i.createdAt),
    assignee: i.assignee ? { id: i.assignee.id, name: fullName(i.assignee)! } : null,
    assigneeRole: i.assigneeRole?.name ?? null,
    resolution: i.resolution,
    attachments: i.attachments.map(attachmentItem),
    timeline: timeline.map((t) => t.item),
    actions: availableActions(i.status, actor, i.assigneeId),
    route: routable
      ? {
          categories: await activeCategories(),
          users: (
            await prisma.user.findMany({
              where: { isActive: true },
              orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
              select: { id: true, firstName: true, lastName: true },
            })
          ).map((x) => ({ id: x.id, name: fullName(x)! })),
        }
      : null,
  };
}
