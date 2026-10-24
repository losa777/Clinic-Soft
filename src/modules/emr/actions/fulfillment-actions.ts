"use server";

import { z } from "zod";
import { type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { detectMimeType, removeDocuments, storeDocument } from "@/lib/document-storage";
import { formatFileSize, MAX_FILE_SIZE } from "@/lib/patient-schema";
import { type ProcedureDoneInput, procedureDoneSchema } from "@/modules/emr/schema";
import { audit } from "@/lib/audit";
import { EMR_TX, EmrError, emrFailure } from "@/modules/emr/server/errors";
import { notify } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { issuePaths, type MaterialsInput, materialsSchema } from "@/modules/inventory/schema";
import { type Db, InventoryError } from "@/modules/inventory/server/db";
import { consume } from "@/modules/inventory/server/operations";

/**
 * დანიშნულებების შესრულება: ლაბორანტი (orders.lab) — ლაბორატორიული/ინსტრუმენტული კვლევა; ექთანი (orders.nurse) —
 * პროცედურა. სტატუსი იცვლება მხოლოდ მოსალოდნელი წინა სტატუსიდან (ერთდროულად ორი შემსრულებელი — ერთი გაივლის).
 * შედეგი ექიმის ბარათში ჩანს და ექიმი შეტყობინებას იღებს.
 */

const idSchema = z.number().int().positive();
/** ექიმის ვიზიტის გვერდი (შეტყობინების ბმული) — src/modules/emr/screens/doctor-screens.tsx */
const DOCTOR_VISIT = "/doctor/visits";

type Materials = { itemId: number; quantity: number }[];

/**
 * შესრულებისას გამოყენებული მასალა (საწყობი): ვალიდაცია და უფლება (inventory.consume). ცარიელი — არაფერი ჩამოიწერება.
 */
function parseMaterials(user: { roleCode: string; permissions: string[] }, input: unknown): { ok: true; materials: Materials } | { ok: false; error: ActionResult } {
  const parsed = materialsSchema.safeParse(input ?? []);
  if (!parsed.success) return { ok: false, error: failure(`გამოყენებული მასალა: ${Object.values(issuePaths(parsed.error))[0] ?? "შეასწორეთ"}`) };
  if (parsed.data.length && !can(user, "inventory.consume")) return { ok: false, error: failure("საწყობიდან გახარჯვის უფლება არ გაქვთ") };
  return { ok: true, materials: parsed.data };
}

/** მასალის ჩამოწერა იმავე ტრანზაქციაში (FEFO); ნაშთი თუ არ ჰყოფნის — მთელი შესრულება უქმდება. */
async function consumeMaterials(tx: Db, userId: number, materials: Materials, order: { id: number; patientId: number; serviceName: string }) {
  for (const m of materials) {
    await consume(tx, userId, { itemId: m.itemId, quantity: m.quantity, note: order.serviceName, patientId: order.patientId, medicalOrderId: order.id });
  }
}

/** EMR-ის ან საწყობის შეცდომა → ActionResult. */
function fulfillmentFailure(error: unknown) {
  if (error instanceof InventoryError) return failure(error.message);
  return emrFailure(error);
}

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
  let rawMaterials: unknown = [];
  try {
    rawMaterials = JSON.parse(String(formData.get("materials") ?? "[]"));
  } catch {
    return failure("გამოყენებული მასალა: არასწორი მონაცემები");
  }
  const mats = parseMaterials(me, rawMaterials);
  if (!mats.ok) return mats.error;

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
      await consumeMaterials(tx, userId, mats.materials, { id: orderId, patientId: o.patientId, serviceName: o.serviceName });
      await audit({ userId, action: "result", entity: "order", entityId: orderId, patientId: o.patientId, details: o.serviceName }, tx);
      await notify(tx, {
        userId: o.createdById,
        type: "lab_ready",
        title: `კვლევის შედეგი მზადაა: ${o.serviceName}`,
        link: `${DOCTOR_VISIT}/${o.encounter.appointmentId}?tab=studies`,
      });
      return o.serviceName;
    }, EMR_TX);
    return success(`შედეგი შენახულია: ${name}`);
  } catch (error) {
    if (stored) await removeDocuments([stored.path]);
    return fulfillmentFailure(error);
  }
}

/** ექთანი: პროცედურა შესრულებულია (ordered → done), შენიშვნით; გამოყენებული მასალა საწყობიდან ჩამოიწერება. */
export async function markProcedureDoneAction(input: ProcedureDoneInput & { materials?: MaterialsInput }): Promise<ActionResult> {
  const me = await requirePermission("orders.nurse");
  const parsed = procedureDoneSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const mats = parseMaterials(me, input.materials);
  if (!mats.ok) return mats.error;
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
      await consumeMaterials(tx, userId, mats.materials, { id: orderId, patientId: o.patientId, serviceName: o.serviceName });
      await audit({ userId, action: "done", entity: "order", entityId: orderId, patientId: o.patientId, details: o.serviceName }, tx);
      await notify(tx, {
        userId: o.createdById,
        type: "procedure_done",
        title: `პროცედურა შესრულდა: ${o.serviceName}`,
        body: note,
        link: `${DOCTOR_VISIT}/${o.encounter.appointmentId}?tab=orders`,
      });
      return o.serviceName;
    }, EMR_TX);
    return success(`შესრულდა: ${name}`);
  } catch (error) {
    return fulfillmentFailure(error);
  }
}
