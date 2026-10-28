import "server-only";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { IssueActor } from "@/modules/issues/rules";

/**
 * ვინ რას ხედავს. ბილეთს ხედავს: ავტორი, მიწერილი შემსრულებელი, კატეგორიის როლის წევრები,
 * issues.view_all — ყველა არაკონფიდენციალურს, issues.manage — ყველას. შექმნა შეუძლია ყველა შესულ მომხმარებელს.
 */
export type IssueUser = {
  id: number;
  /** აქტიური როლის id — კატეგორიის მიმღებ როლთან შესადარებლად (სხვა როლის ბილეთები იმ როლზე გადასვლისას ჩანს) */
  roleIds: number[];
  isManager: boolean;
  viewsAll: boolean;
};

export async function issueUser(user: Session["user"]): Promise<IssueUser> {
  const roles = await prisma.role.findMany({ where: { code: user.roleCode }, select: { id: true } });
  return {
    id: Number(user.id),
    roleIds: roles.map((r) => r.id),
    isManager: can(user, "issues.manage"),
    viewsAll: can(user, "issues.view_all"),
  };
}

/** ჩემზე მიწერილი: პირადად ან ჩემი როლის კატეგორიაში. */
export function workerWhere(u: IssueUser): Prisma.IssueWhereInput {
  return { OR: [{ assigneeId: u.id }, ...(u.roleIds.length ? [{ assigneeRoleId: { in: u.roleIds } }] : [])] };
}

export function visibleWhere(u: IssueUser): Prisma.IssueWhereInput {
  if (u.isManager) return {};
  return {
    OR: [{ createdById: u.id }, ...(workerWhere(u).OR ?? []), ...(u.viewsAll ? [{ category: { isConfidential: false } }] : [])],
  };
}

export function actorOf(u: IssueUser, issue: { createdById: number; assigneeId: number | null; assigneeRoleId: number | null }): IssueActor {
  return {
    userId: u.id,
    isCreator: issue.createdById === u.id,
    isWorker: u.isManager || issue.assigneeId === u.id || (issue.assigneeRoleId !== null && u.roleIds.includes(issue.assigneeRoleId)),
    isManager: u.isManager,
  };
}
