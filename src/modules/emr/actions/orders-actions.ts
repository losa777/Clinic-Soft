"use server";

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { allergyMatches } from "@/modules/emr/allergy";
import { type OrderInput, orderSchema, type PrescriptionInput, prescriptionSchema } from "@/modules/emr/schema";
import { audit } from "@/modules/emr/server/audit";
import { EMR_TX, EmrError, emrFailure } from "@/modules/emr/server/errors";

/**
 * ექიმის დანიშნულებები: რეცეპტი, კვლევები, პროცედურები — მხოლოდ საკუთარ, დაუსრულებელ ვიზიტზე (emr.edit).
 * ყველა ცვლილება აუდიტში იწერება.
 */

const idSchema = z.number().int().positive();

async function ownDraft(tx: Prisma.TransactionClient, encounterId: number, userId: number) {
  const e = await tx.encounter.findUnique({ where: { id: encounterId }, select: { doctorId: true, status: true, patientId: true } });
  if (!e) throw new EmrError("ვიზიტის ჩანაწერი ვერ მოიძებნა");
  if (e.doctorId !== userId) throw new EmrError("ეს ვიზიტი სხვა ექიმისაა — მხოლოდ სანახავად");
  if (e.status !== "draft") throw new EmrError("ვიზიტი დასრულებულია — დანიშნულება აღარ ემატება");
  return e;
}

export type PrescriptionResult = { ok: true; message: string } | (ActionFailure & { allergyWarning?: string[] });

/**
 * მედიკამენტის დანიშვნა. პაციენტის აქტიურ ალერგიას თუ ემთხვევა — ჯერ გაფრთხილება (allergyWarning),
 * ექიმის დადასტურების (acknowledgeAllergy) შემდეგ — ჩაწერა და აუდიტში აღნიშვნა.
 */
export async function addPrescriptionAction(input: PrescriptionInput): Promise<PrescriptionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = prescriptionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { acknowledgeAllergy, encounterId, ...data } = parsed.data;
  const userId = Number(me.id);

  try {
    return await prisma.$transaction(async (tx) => {
      const e = await ownDraft(tx, encounterId, userId);
      const allergies = await tx.patientAllergy.findMany({ where: { patientId: e.patientId, isActive: true }, select: { substance: true } });
      const matches = allergyMatches(data.drugName, allergies.map((a) => a.substance));
      if (matches.length && !acknowledgeAllergy) {
        return { ...failure(`პაციენტს ალერგია აქვს: ${matches.join(", ")}`), allergyWarning: matches };
      }
      const p = await tx.prescription.create({
        data: { ...data, encounterId, patientId: e.patientId, createdById: userId, createdAt: new Date() },
      });
      await audit(
        {
          userId,
          action: "create",
          entity: "prescription",
          entityId: p.id,
          patientId: e.patientId,
          details: matches.length ? `${data.drugName} — ალერგიის გაფრთხილება დადასტურდა (${matches.join(", ")})` : data.drugName,
        },
        tx,
      );
      return { ok: true as const, message: `დაინიშნა: ${data.drugName}` };
    }, EMR_TX);
  } catch (error) {
    return emrFailure(error);
  }
}

export async function deletePrescriptionAction(id: number): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  if (!idSchema.safeParse(id).success) return failure("ჩანაწერი ვერ მოიძებნა");
  const userId = Number(me.id);
  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.prescription.findUnique({ where: { id }, select: { encounterId: true, drugName: true } });
      if (!p) throw new EmrError("ჩანაწერი ვერ მოიძებნა");
      const e = await ownDraft(tx, p.encounterId, userId);
      await tx.prescription.delete({ where: { id } });
      await audit({ userId, action: "delete", entity: "prescription", entityId: id, patientId: e.patientId, details: p.drugName }, tx);
    }, EMR_TX);
    return success("მედიკამენტი მოიხსნა");
  } catch (error) {
    return emrFailure(error);
  }
}

/** კვლევის/პროცედურის დანიშვნა არსებული სერვისიდან (კატეგორიის დანიშნულების ტიპი უნდა ემთხვეოდეს). */
export async function addOrderAction(input: OrderInput): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { encounterId, serviceId, type, note } = parsed.data;
  const userId = Number(me.id);

  try {
    const name = await prisma.$transaction(async (tx) => {
      const e = await ownDraft(tx, encounterId, userId);
      const service = await tx.service.findFirst({
        where: { id: serviceId, isActive: true, category: { orderType: type } },
        select: { name: true },
      });
      if (!service) throw new EmrError("სერვისი ვერ მოიძებნა ან ამ ტიპის დანიშნულება არ არის", { serviceId: "აირჩიეთ სიიდან" });
      const now = new Date();
      const o = await tx.medicalOrder.create({
        data: { encounterId, patientId: e.patientId, type, serviceId, serviceName: service.name, note, createdById: userId, createdAt: now, updatedAt: now },
      });
      await audit({ userId, action: "create", entity: "order", entityId: o.id, patientId: e.patientId, details: `${type}: ${service.name}` }, tx);
      return service.name;
    }, EMR_TX);
    return success(`დაინიშნა: ${name}`);
  } catch (error) {
    return emrFailure(error);
  }
}

/** დანიშნულების გაუქმება ექიმის მიერ — მხოლოდ სანამ შესრულება არ დაწყებულა (status = ordered). */
export async function cancelOrderAction(id: number): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  if (!idSchema.safeParse(id).success) return failure("დანიშნულება ვერ მოიძებნა");
  const userId = Number(me.id);
  try {
    await prisma.$transaction(async (tx) => {
      const o = await tx.medicalOrder.findUnique({ where: { id }, select: { encounterId: true, status: true } });
      if (!o) throw new EmrError("დანიშნულება ვერ მოიძებნა");
      const e = await ownDraft(tx, o.encounterId, userId);
      const { count } = await tx.medicalOrder.updateMany({ where: { id, status: "ordered" }, data: { status: "cancelled", updatedAt: new Date() } });
      if (!count) throw new EmrError("შესრულება უკვე დაწყებულია — გაუქმება შეუძლებელია");
      await audit({ userId, action: "cancel", entity: "order", entityId: id, patientId: e.patientId }, tx);
    }, EMR_TX);
    return success("დანიშნულება გაუქმდა");
  } catch (error) {
    return emrFailure(error);
  }
}
