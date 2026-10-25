import "server-only";
import { prisma } from "@/lib/db";
import { type ColumnKey, DEFAULT_COLUMNS, pickColumns } from "@/modules/reporting/columns";
import type { TemplateRow } from "@/modules/reporting/actions";

/** შენახული JSON → ცნობილი სვეტები (ძველ ჩანაწერში წაშლილი სვეტი გამოიტოვება, დაზიანებული — ცარიელი). */
function parseStored(json: string): ColumnKey[] {
  try {
    return pickColumns(JSON.parse(json) as string[]);
  } catch {
    return [];
  }
}

/** მომხმარებლის ექსპორტის შაბლონები. */
export async function loadTemplates(userId: number): Promise<TemplateRow[]> {
  const rows = await prisma.reportTemplate.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, columns: true } });
  return rows.map((t) => ({ id: t.id, name: t.name, columns: parseStored(t.columns) }));
}

/** ბოლოს არჩეული სვეტები (მონიშვნისთანავე ინახება); ჯერ არაფერი — ნაგულისხმევი ნაკრები. */
export async function loadColumns(userId: number): Promise<ColumnKey[]> {
  const pref = await prisma.reportPreference.findUnique({ where: { userId }, select: { columns: true } });
  const columns = pref ? parseStored(pref.columns) : [];
  return columns.length ? columns : DEFAULT_COLUMNS;
}
