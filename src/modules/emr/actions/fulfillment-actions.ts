"use server";

import { z } from "zod";
import { type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { detectMimeType, removeDocuments, storeDocument } from "@/lib/document-storage";
import { formatFileSize, MAX_FILE_SIZE } from "@/lib/patient-schema";
import { type ProcedureDoneInput, procedureDoneSchema } from "@/modules/emr/schema";
import { audit } from "@/modules/emr/server/audit";
import { EMR_TX, EmrError, emrFailure } from "@/modules/emr/server/errors";
import { notify } from "@/modules/emr/server/orders";

/**
 * დანიშნულებების შესრულება: ლაბორანტი (orders.lab) — ლაბორატორიული/ინსტრუმენტული კვლევა; ექთანი (orders.nurse) —
 * პროცედურა. სტატუსი იცვლება მხოლოდ მოსალოდნელი წინა სტატუსიდან (ერთდროულად ორი შემსრულებელი — ერთი გაივლის).
 * შედეგი ექიმის ბარათში ჩანს და ექიმი შეტყობინებას იღებს.
 */

const idSchema = z.number().int().positive();
const DOCTOR_LINK = "/doctor";

/** ლაბორატორია: „ნიმუში აღებულია“ (ordered → sample_taken). */
export async function markSampleTakenAction(orderId: number): Promise<ActionResult> {
  const me = await requirePermission("orders.lab");
  if (!idSchema.safeParse(orderId).success) return failure("დანიშნულება ვერ მოიძებნა");
  const userId = Number(me.id);
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.medicalOrder.updateMany({
      where: { id: orderId, type: "lab", status: "ordered" },
      data: { status: "sample_taken", performedById: userId, updatedAt: new Date() },
    });
    if (count) {
      const o = await tx.medicalOrder.findUniqueOrThrow({ where: { id: orderId }, select: { patientId: true } });
      await audit({ userId, action: "sample_taken", entity: "order", entityId: orderId, patientId: o.patientId }, tx);
    }
    return count;
  }, EMR_TX);
  return updated ? success("ნიმუში აღებულია") : failure("დანიშნულება ვერ მოიძებნა ან სტატუსი უკვე შეცვლილია");
}

const resultSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  resultText: z
    .string()
    .trim()
    .max(10_000, "ტექსტი ძალიან გრძელია")
    .transform((v) => v || null),
});

/**
 * კვლევის შედეგი (ტექსტი და/ან ფაილი: JPG, PNG, PDF) → „მზადაა“. ფაილი პაციენტის ფაილებშია (lab_result / imaging);
 * ჯერ დისკზე, მერე ბაზა ტრანზაქციაში — ჩავარდნისას ფაილი იშლება.
 */
export async function submitResultAction(formData: FormData): Promise<ActionResult> {
  const me = await requirePermission("orders.lab");
  const parsed = resultSchema.safeParse({ orderId: formData.get("orderId"), resultText: String(formData.get("resultText") ?? "") });
  if (!parsed.success) return invalid(parsed.error);
  const { orderId, resultText } = parsed.data;
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!resultText && !hasFile) return failure("შეიყვანეთ შედეგი ან დაურთეთ ფაილი", { resultText: "შედეგი ცარიელია" });

  let stored: { path: string; mimeType: string; size: number; name: string } | null = null;
  if (hasFile) {
    if (file.size > MAX_FILE_SIZE) return failure(`ფაილი ${formatFileSize(MAX_FILE_SIZE)}-ზე დიდია`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectMimeType(bytes);
    if (!mimeType) return failure("დასაშვებია მხოლოდ JPG, PNG ან PDF");
    stored = { path: await storeDocument(bytes, mimeType), mimeType, size: bytes.byteLength, name: file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(-255) || "result" };
  }
  const userId = Number(me.id);

  try {
    const name = await prisma.$transaction(async (tx) => {
      const o = await tx.medicalOrder.findUnique({
        where: { id: orderId },
        select: { type: true, status: true, patientId: true, serviceName: true, createdById: true, encounter: { select: { appointmentId: true } } },
      });
      if (!o || o.type === "procedure") throw new EmrError("კვლევა ვერ მოიძებნა");
      if (o.status !== "ordered" && o.status !== "sample_taken") throw new EmrError("შედეგი უკვე შეყვანილია ან დანიშნულება გაუქმებულია");

      const doc = stored
        ? await tx.patientDocument.create({
            data: {
              patientId: o.patientId,
              docType: o.type === "lab" ? "lab_result" : "imaging",
              title: o.serviceName,
              originalName: stored.name,
              storagePath: stored.path,
              mimeType: stored.mimeType,
              sizeBytes: stored.size,
              uploadedById: userId,
            },
            select: { id: true },
          })
        : null;
      const now = new Date();
      const { count } = await tx.medicalOrder.updateMany({
        where: { id: orderId, status: o.status },
        data: { status: "ready", resultText, resultDocumentId: doc?.id ?? null, performedById: userId, performedAt: now, updatedAt: now },
      });
      if (!count) throw new EmrError("დანიშნულება ამასობაში შეიცვალა — განაახლეთ გვერდი");
      await audit({ userId, action: "result", entity: "order", entityId: orderId, patientId: o.patientId, details: o.serviceName }, tx);
      await notify(tx, {
        userId: o.createdById,
        type: "lab_ready",
        title: `კვლევის შედეგი მზადაა: ${o.serviceName}`,
        link: `${DOCTOR_LINK}?appointment=${o.encounter.appointmentId}&tab=studies`,
      });
      return o.serviceName;
    }, EMR_TX);
    return success(`შედეგი შენახულია: ${name}`);
  } catch (error) {
    if (stored) await removeDocuments([stored.path]);
    return emrFailure(error);
  }
}

/** ექთანი: პროცედურა შესრულებულია (ordered → done), შენიშვნით. */
export async function markProcedureDoneAction(input: ProcedureDoneInput): Promise<ActionResult> {
  const me = await requirePermission("orders.nurse");
  const parsed = procedureDoneSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { orderId, note } = parsed.data;
  const userId = Number(me.id);
  try {
    const name = await prisma.$transaction(async (tx) => {
      const o = await tx.medicalOrder.findUnique({
        where: { id: orderId },
        select: { type: true, patientId: true, serviceName: true, createdById: true, encounter: { select: { appointmentId: true } } },
      });
      if (!o || o.type !== "procedure") throw new EmrError("პროცედურა ვერ მოიძებნა");
      const now = new Date();
      const { count } = await tx.medicalOrder.updateMany({
        where: { id: orderId, status: "ordered" },
        data: { status: "done", resultText: note, performedById: userId, performedAt: now, updatedAt: now },
      });
      if (!count) throw new EmrError("პროცედურა უკვე შესრულებულია ან გაუქმებულია");
      await audit({ userId, action: "done", entity: "order", entityId: orderId, patientId: o.patientId, details: o.serviceName }, tx);
      await notify(tx, {
        userId: o.createdById,
        type: "procedure_done",
        title: `პროცედურა შესრულდა: ${o.serviceName}`,
        body: note,
        link: `${DOCTOR_LINK}?appointment=${o.encounter.appointmentId}&tab=orders`,
      });
      return o.serviceName;
    }, EMR_TX);
    return success(`შესრულდა: ${name}`);
  } catch (error) {
    return emrFailure(error);
  }
}
