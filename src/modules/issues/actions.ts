"use server";

import { type ActionFailure, type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { requirePermission, requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { emitLive } from "@/lib/live";
import { ISSUE_ACTIONS, type IssueAction } from "@/modules/issues/rules";
import { categorySchema, type CategoryInput, commentSchema, issueActionSchema, type IssueActionInput, issueSchema, routeSchema, type RouteInput } from "@/modules/issues/schema";
import { issueUser } from "@/modules/issues/server/access";
import { issueFailure, issueTx } from "@/modules/issues/server/db";
import { discardIssueFiles, type StoredIssueFile, storeIssueFiles } from "@/modules/issues/server/files";
import { activeCategories, addIssueComment, applyIssueAction, createIssue, routeIssue } from "@/modules/issues/server/issues";
import type { IssueCategoryOption } from "@/modules/issues/types";

/**
 * პრობლემების შეტყობინება. შექმნა და საკუთარის ნახვა — ყველა შესულ მომხმარებელს; დანარჩენს ამოწმებს
 * server/access.ts (ვინ ხედავს / ვინ ამუშავებს) და rules.ts (რომელი მოქმედება რომელ სტატუსზე).
 */

export type IssueCreateResult = { ok: true; message: string; issueId: number } | ActionFailure;

/** ფორმის მონაცემები („პრობლემა“ ღილაკი ზედა პანელში): აქტიური კატეგორიები. */
export async function issueFormAction(): Promise<IssueCategoryOption[]> {
  await requireUser();
  return activeCategories();
}

const filesOf = (formData: FormData) => formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

function jsonOf(formData: FormData, key: string): unknown {
  try {
    return JSON.parse(String(formData.get(key) ?? "null"));
  } catch {
    return null;
  }
}

/** ფაილები ჯერ დისკზე იწერება; ბილეთი/კომენტარი თუ ვერ შეიქმნა — იშლება. */
async function withFiles<T>(formData: FormData, fn: (files: StoredIssueFile[]) => Promise<T>): Promise<T> {
  const stored = await storeIssueFiles(filesOf(formData));
  try {
    return await fn(stored);
  } catch (error) {
    await discardIssueFiles(stored);
    throw error;
  }
}

export async function createIssueAction(formData: FormData): Promise<IssueCreateResult> {
  const me = await requireUser();
  const parsed = issueSchema.safeParse(jsonOf(formData, "issue"));
  if (!parsed.success) return invalid(parsed.error);
  const u = await issueUser(me);

  try {
    const issue = await withFiles(formData, (files) =>
      issueTx(async (tx) => {
        const issue = await createIssue(tx, parsed.data, files, u, me.roleCode);
        await audit({ userId: u.id, action: "create", entity: "issue", entityId: issue.id, details: `${issue.number} · ${parsed.data.title}` }, tx);
        return issue;
      }),
    );
    emitLive(["issues"]);
    return { ok: true, message: `პრობლემა დაფიქსირდა: ${issue.number}`, issueId: issue.id };
  } catch (error) {
    return issueFailure(error);
  }
}

export async function issueActionAction(input: IssueActionInput): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = issueActionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const u = await issueUser(me);
  const action = parsed.data.action as IssueAction;

  try {
    const message = await issueTx(async (tx) => {
      const message = await applyIssueAction(tx, parsed.data.issueId, action, parsed.data.text, u);
      await audit({ userId: u.id, action: "status", entity: "issue", entityId: parsed.data.issueId, details: ISSUE_ACTIONS[action].label }, tx);
      return message;
    });
    emitLive(["issues"]);
    return success(message);
  } catch (error) {
    return issueFailure(error);
  }
}

export async function commentIssueAction(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = commentSchema.safeParse(jsonOf(formData, "comment"));
  if (!parsed.success) return invalid(parsed.error);
  const u = await issueUser(me);

  try {
    await withFiles(formData, (files) =>
      issueTx(async (tx) => {
        await addIssueComment(tx, parsed.data.issueId, parsed.data.body, files, u);
        await audit({ userId: u.id, action: "comment", entity: "issue", entityId: parsed.data.issueId }, tx);
      }),
    );
    emitLive(["issues"]);
    return success("კომენტარი დაემატა");
  } catch (error) {
    return issueFailure(error);
  }
}

export async function routeIssueAction(input: RouteInput): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = routeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const u = await issueUser(me);

  try {
    const message = await issueTx(async (tx) => {
      const message = await routeIssue(tx, parsed.data, u);
      await audit({ userId: u.id, action: "assign", entity: "issue", entityId: parsed.data.issueId }, tx);
      return message;
    });
    emitLive(["issues"]);
    return success(message);
  } catch (error) {
    return issueFailure(error);
  }
}

/** კატეგორიის დამატება/რედაქტირება (issues.manage). ძველ ბილეთებს მიმღები როლი არ ეცვლება. */
export async function saveCategoryAction(input: CategoryInput): Promise<ActionResult> {
  const me = await requirePermission("issues.manage");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;

  try {
    const role = await prisma.role.findUnique({ where: { id: data.assigneeRoleId }, select: { id: true } });
    if (!role) return failure("შეასწორეთ მონიშნული ველები", { assigneeRoleId: "როლი ვერ მოიძებნა" });
    if (id) {
      const { count } = await prisma.issueCategory.updateMany({ where: { id }, data });
      if (!count) return failure("კატეგორია ვერ მოიძებნა");
    } else {
      await prisma.issueCategory.create({ data: { ...data, createdAt: new Date() } });
    }
    await audit({ userId: Number(me.id), action: id ? "update" : "create", entity: "issue_category", entityId: id ?? null, details: data.name });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("შეასწორეთ მონიშნული ველები", { name: "ეს კატეგორია უკვე არსებობს" });
    throw error;
  }
  emitLive(["issues"]);
  return success(id ? "ცვლილებები შენახულია" : `კატეგორია „${data.name}“ დაემატა`);
}
