"use server";

import { z } from "zod";
import { type ActionFailure, type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { formatTime } from "@/lib/appointment-slots";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { type EncounterDraftInput, encounterDraftSchema, type TemplateInput, templateSchema } from "@/modules/emr/schema";
import { audit } from "@/lib/audit";
import { EMR_TX, EmrError } from "@/modules/emr/server/errors";
import { saveEncounterMeasurements } from "@/modules/emr/server/measurements";

export type DraftSaveResult = { ok: true; version: number; savedAt: string } | (ActionFailure & { conflict?: boolean });

/** ავტოშენახვისას აუდიტში ერთი ჩანაწერი ამ ინტერვალში (ყოველ 3 წამში ჩაწერა ლოგს გაავსებდა). */
const AUDIT_EVERY_MS = 10 * 60_000;

/**
 * ვიზიტის ფორმის შენახვა (ავტოშენახვა): მხოლოდ საკუთარი, დაუსრულებელი ჩანაწერი; ვერსიის შემოწმებით —
 * ჩანაწერი ორ ფანჯარაში თუ ღიაა, ძველი ვერსია ახალს არ გადაეწერება (conflict). დიაგნოზები — იმავე ტრანზაქციაში.
 */
export async function saveEncounterDraftAction(input: EncounterDraftInput): Promise<DraftSaveResult> {
  const me = await requirePermission("emr.edit");
  const parsed = encounterDraftSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { encounterId, version, diagnoses, measurements, ...fields } = parsed.data;
  const userId = Number(me.id);

  try {
    return await prisma.$transaction(async (tx) => {
      const e = await tx.encounter.findUnique({ where: { id: encounterId }, select: { doctorId: true, status: true, patientId: true } });
      if (!e) throw new EmrError("ვიზიტის ჩანაწერი ვერ მოიძებნა");
      if (e.doctorId !== userId) throw new EmrError("ეს ვიზიტი სხვა ექიმისაა — მხოლოდ სანახავად");
      if (e.status !== "draft") throw new EmrError("ვიზიტი დასრულებულია — ჩანაწერი ჩაკეტილია");

      if (diagnoses.length) {
        const found = await tx.icd10Code.count({ where: { code: { in: diagnoses.map((d) => d.code) } } });
        if (found !== diagnoses.length) throw new EmrError("დიაგნოზის კოდი ვერ მოიძებნა — აირჩიეთ სიიდან", { diagnoses: "უცნობი კოდი" });
      }

      const now = new Date();
      // ვერსია ემთხვევა → ჩაწერა და ვერსია +1; არ ემთხვევა → სხვა ფანჯარამ უკვე შეცვალა
      const { count } = await tx.encounter.updateMany({
        where: { id: encounterId, version, status: "draft" },
        data: { ...fields, version: { increment: 1 }, updatedAt: now },
      });
      if (count === 0) {
        throw new EmrError("ჩანაწერი სხვა ფანჯარაში შეიცვალა — განაახლეთ გვერდი (ბოლო ცვლილებები სხვა ფანჯარაშია)", { conflict: "1" });
      }
      await saveEncounterMeasurements(tx, encounterId, e.patientId, measurements);
      await tx.encounterDiagnosis.deleteMany({ where: { encounterId } });
      if (diagnoses.length) {
        await tx.encounterDiagnosis.createMany({
          data: diagnoses.map((d) => ({ encounterId, icd10Code: d.code, isPrimary: d.primary, isComplication: d.complication })),
        });
      }

      const recent = await tx.auditLog.count({
        where: { userId, entity: "encounter", entityId: encounterId, action: "update", createdAt: { gte: new Date(now.getTime() - AUDIT_EVERY_MS) } },
      });
      if (!recent) await audit({ userId, action: "update", entity: "encounter", entityId: encounterId, patientId: e.patientId }, tx);

      return { ok: true as const, version: version + 1, savedAt: formatTime(now) };
    }, EMR_TX);
  } catch (error) {
    if (error instanceof EmrError) {
      const conflict = error.fieldErrors?.conflict === "1";
      return { ...failure(error.message, conflict ? undefined : error.fieldErrors), conflict };
    }
    throw error;
  }
}

export type TemplateCreateResult = { ok: true; message: string; template: { id: number; field: string; title: string; content: string } } | ActionFailure;

/** შაბლონის შენახვა (ექიმის საკუთარი, ველის მიხედვით). */
export async function createTemplateAction(input: TemplateInput): Promise<TemplateCreateResult> {
  const me = await requirePermission("emr.edit");
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const t = await prisma.doctorTemplate.create({
    data: { ...parsed.data, userId: Number(me.id), createdAt: new Date() },
    select: { id: true, field: true, title: true, content: true },
  });
  return { ok: true, message: `შაბლონი „${t.title}“ შენახულია`, template: t };
}

/** შაბლონის წაშლა — მხოლოდ საკუთარი. */
export async function deleteTemplateAction(id: number): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  if (!z.number().int().positive().safeParse(id).success) return failure("შაბლონი ვერ მოიძებნა");
  const { count } = await prisma.doctorTemplate.deleteMany({ where: { id, userId: Number(me.id) } });
  return count ? success("შაბლონი წაიშალა") : failure("შაბლონი ვერ მოიძებნა");
}
