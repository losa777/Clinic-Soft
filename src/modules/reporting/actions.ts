"use server";

import { z } from "zod";
import { type ActionFailure, type ActionResult, failure, isUniqueViolation, success } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { pickColumns } from "@/modules/reporting/columns";
import { seesAllPatients } from "@/modules/reporting/server/access";

/**
 * ანგარიშგება: ჯანდაცვის პორტალზე ატვირთვის მონიშვნა და ექსპორტის შაბლონები (reporting.export).
 * reporting.all_patients-ის გარეშე — მხოლოდ საოპერაციო ვიზიტები.
 */

const idsSchema = z.array(z.number().int().positive()).min(1, "მონიშნეთ ერთი ჩანაწერი მაინც").max(1000, "ერთდროულად მაქსიმუმ 1000");

/** მონიშნული ვიზიტები — „ატვირთულია“ (uploaded) ან ისევ „ასატვირთი“. */
export async function markUploadedAction(encounterIds: number[], uploaded: boolean): Promise<ActionResult> {
  const me = await requirePermission("reporting.view", "reporting.export");
  const parsed = idsSchema.safeParse(encounterIds);
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  const userId = Number(me.id);
  const ids = [...new Set(parsed.data)];

  const { count } = await prisma.encounter.updateMany({
    where: { id: { in: ids }, ...(seesAllPatients(me) ? {} : { isSurgical: true }) },
    data: uploaded ? { portalUploadedAt: new Date(), portalUploadedById: userId } : { portalUploadedAt: null, portalUploadedById: null },
  });
  if (!count) return failure("ჩანაწერები ვერ მოიძებნა — განაახლეთ გვერდი");
  await audit({
    userId,
    action: uploaded ? "portal_upload" : "portal_upload_undo",
    entity: "encounter",
    details: `${count} ვიზიტი: ${ids.slice(0, 50).join(", ")}${ids.length > 50 ? "…" : ""}`,
  });
  return success(uploaded ? `ატვირთულად მოინიშნა: ${count}` : `ისევ ასატვირთია: ${count}`);
}

export type TemplateRow = { id: number; name: string; columns: string[] };
export type TemplateSaveResult = { ok: true; message: string; template: TemplateRow } | ActionFailure;

const templateSchema = z.object({
  name: z.string().trim().min(1, "შეიყვანეთ შაბლონის სახელი").max(100, "მაქსიმუმ 100 სიმბოლო"),
  columns: z.array(z.string()).max(100),
});

/** შაბლონი (არჩეული სვეტები) — მომხმარებლის პირადი; იგივე სახელით — გადაიწერება. */
export async function saveTemplateAction(input: { name: string; columns: string[] }): Promise<TemplateSaveResult> {
  const me = await requirePermission("reporting.export");
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return failure("შეასწორეთ მონიშნული ველები", { name: parsed.error.issues[0].message });
  const columns = pickColumns(parsed.data.columns);
  if (!columns.length) return failure("აირჩიეთ ერთი სვეტი მაინც");
  const userId = Number(me.id);
  try {
    const t = await prisma.reportTemplate.upsert({
      where: { userId_name: { userId, name: parsed.data.name } },
      create: { userId, name: parsed.data.name, columns: JSON.stringify(columns), createdAt: new Date() },
      update: { columns: JSON.stringify(columns) },
      select: { id: true, name: true },
    });
    return { ok: true, message: `შაბლონი „${t.name}“ შენახულია`, template: { ...t, columns } };
  } catch (error) {
    if (isUniqueViolation(error)) return failure("შაბლონი ამ სახელით უკვე არსებობს", { name: "სხვა სახელი აირჩიეთ" });
    throw error;
  }
}

/** არჩეული სვეტების შენახვა (მონიშვნისთანავე) — შემდეგ შესვლაზეც რჩება, Excel-იც ამ სვეტებით გადის. */
export async function saveColumnsAction(columns: string[]): Promise<ActionResult> {
  const me = await requirePermission("reporting.export");
  if (!Array.isArray(columns) || columns.length > 100) return failure("სვეტები არასწორია");
  const picked = pickColumns(columns.map(String));
  if (!picked.length) return failure("აირჩიეთ ერთი სვეტი მაინც");
  const userId = Number(me.id);
  const data = { columns: JSON.stringify(picked), updatedAt: new Date() };
  await prisma.reportPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return success("სვეტები შენახულია");
}

/** შაბლონის არჩევა: მისი სვეტები ხდება მიმდინარე (შენახული) არჩევანი. */
export async function applyTemplateAction(id: number): Promise<ActionResult> {
  const me = await requirePermission("reporting.export");
  if (!z.number().int().positive().safeParse(id).success) return failure("შაბლონი ვერ მოიძებნა");
  const userId = Number(me.id);
  const t = await prisma.reportTemplate.findFirst({ where: { id, userId }, select: { name: true, columns: true } });
  if (!t) return failure("შაბლონი ვერ მოიძებნა");
  const data = { columns: t.columns, updatedAt: new Date() };
  await prisma.reportPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return success(`შაბლონი „${t.name}“ არჩეულია`);
}

export async function deleteTemplateAction(id: number): Promise<ActionResult> {
  const me = await requirePermission("reporting.export");
  if (!z.number().int().positive().safeParse(id).success) return failure("შაბლონი ვერ მოიძებნა");
  const { count } = await prisma.reportTemplate.deleteMany({ where: { id, userId: Number(me.id) } });
  return count ? success("შაბლონი წაიშალა") : failure("შაბლონი ვერ მოიძებნა");
}
