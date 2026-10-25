import "server-only";
import { prisma } from "@/lib/db";
import type { CategoryRow } from "@/modules/issues/types";

/** კატეგორიები (issues.manage): გათიშული ახალ ბილეთში აღარ ჩანს, ძველი ბილეთები რჩება. წაშლა არ არის. */
export async function listCategories(): Promise<CategoryRow[]> {
  const rows = await prisma.issueCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { assigneeRole: { select: { name: true } }, _count: { select: { issues: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    assigneeRoleId: c.assigneeRoleId,
    assigneeRole: c.assigneeRole?.name ?? null,
    isConfidential: c.isConfidential,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    issues: c._count.issues,
  }));
}

export async function roleOptions(): Promise<{ value: string; label: string }[]> {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return roles.map((r) => ({ value: String(r.id), label: r.name }));
}
