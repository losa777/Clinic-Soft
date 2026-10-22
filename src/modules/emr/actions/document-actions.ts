"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { DEVICE_ID_PATTERN } from "@/components/signature/devices";
import type { Prisma } from "@/generated/prisma/client";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { formatDate, formatTime, tbilisiParts } from "@/lib/appointment-slots";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { detectMimeType, readDocument, removeDocuments, storeDocument } from "@/lib/document-storage";
import { renderDocumentPdf } from "@/modules/emr/documents/pdf";
import { DOCUMENT_TEMPLATES, isDocumentType, validateDocumentValues } from "@/modules/emr/documents/templates";
import { audit } from "@/modules/emr/server/audit";
import { loadPdfInput, loadPrefillContext, serializeContent } from "@/modules/emr/server/documents";
import { EMR_TX, EmrError, emrFailure } from "@/modules/emr/server/errors";

/**
 * სამედიცინო დოკუმენტები: დრაფტი → ხელმოწერა (PDF ინახება, sha256, ჩაიკეტება) → ახალი ვერსია (ძველი „ჩანაცვლებულია“).
 * ხელმოწერილი დოკუმენტი აღარ იცვლება და არ იშლება — მხოლოდ ახალი ვერსიით. ქმნის/ასწორებს ავტორი (emr.edit),
 * ხელს აწერს ავტორი (documents.sign). ყველა ცვლილება აუდიტშია.
 */

const idSchema = z.number().int().positive();
const valuesSchema = z.record(z.string(), z.string().max(10_000));

const createSchema = z.object({ encounterId: idSchema, type: z.string().refine(isDocumentType, "დოკუმენტის ტიპი არასწორია") });

const MAX_SIGNATURE_BYTES = 512 * 1024;

/** ახალი დოკუმენტი საკუთარ ვიზიტზე — ველები ივსება ვიზიტის მონაცემებით. */
export async function createDocumentAction(input: { encounterId: number; type: string }): Promise<ActionResult & { documentId?: number }> {
  const me = await requirePermission("emr.edit");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { encounterId } = parsed.data;
  const type = parsed.data.type as keyof typeof DOCUMENT_TEMPLATES;
  const userId = Number(me.id);
  const template = DOCUMENT_TEMPLATES[type];

  try {
    const id = await prisma.$transaction(async (tx) => {
      const e = await tx.encounter.findUnique({ where: { id: encounterId }, select: { doctorId: true, patientId: true } });
      if (!e) throw new EmrError("ვიზიტის ჩანაწერი ვერ მოიძებნა");
      if (e.doctorId !== userId) throw new EmrError("დოკუმენტს ქმნის ვიზიტის ექიმი");
      const context = await loadPrefillContext(tx, encounterId);
      const values = context ? template.prefill(context) : {};
      const doc = await tx.medicalDocument.create({
        data: {
          patientId: e.patientId,
          encounterId,
          type,
          title: template.title,
          content: serializeContent(values),
          createdById: userId,
          createdAt: new Date(),
        },
        select: { id: true },
      });
      await audit({ userId, action: "create", entity: "document", entityId: doc.id, patientId: e.patientId, details: template.title }, tx);
      return doc.id;
    }, EMR_TX);
    return { ...success(`შეიქმნა: ${template.title}`), documentId: id };
  } catch (error) {
    return emrFailure(error);
  }
}

/** დრაფტის ჩაკეტვა და შემოწმება: არსებობს, ავტორი — მე, სტატუსი — დრაფტი. */
async function lockOwnDraft(tx: Prisma.TransactionClient, documentId: number, userId: number) {
  await tx.$queryRaw`SELECT id FROM medical_documents WHERE id = ${documentId} FOR UPDATE`;
  const d = await tx.medicalDocument.findUnique({
    where: { id: documentId },
    select: { id: true, type: true, status: true, createdById: true, patientId: true, previousId: true, version: true, title: true },
  });
  if (!d || !isDocumentType(d.type)) throw new EmrError("დოკუმენტი ვერ მოიძებნა");
  if (d.createdById !== userId) throw new EmrError("დოკუმენტს ასწორებს მხოლოდ მისი ავტორი");
  if (d.status !== "draft") throw new EmrError("დოკუმენტი ხელმოწერილია და ჩაკეტილია — შექმენით ახალი ვერსია");
  return { ...d, type: d.type };
}

/** დრაფტის შენახვა (სავალდებულო ველები ჯერ არ მოწმდება). */
export async function saveDocumentAction(input: { documentId: number; values: Record<string, string> }): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = z.object({ documentId: idSchema, values: valuesSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const userId = Number(me.id);
  try {
    await prisma.$transaction(async (tx) => {
      const d = await lockOwnDraft(tx, parsed.data.documentId, userId);
      const checked = validateDocumentValues(d.type, parsed.data.values, false);
      if (!checked.ok) throw new EmrError("შეასწორეთ მონიშნული ველები", checked.errors);
      await tx.medicalDocument.update({ where: { id: d.id }, data: { content: serializeContent(checked.values) } });
      await audit({ userId, action: "update", entity: "document", entityId: d.id, patientId: d.patientId }, tx);
    }, EMR_TX);
    return success("დოკუმენტი შენახულია");
  } catch (error) {
    return emrFailure(error);
  }
}

export async function deleteDraftAction(documentId: number): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  if (!idSchema.safeParse(documentId).success) return failure("დოკუმენტი ვერ მოიძებნა");
  const userId = Number(me.id);
  try {
    await prisma.$transaction(async (tx) => {
      const d = await lockOwnDraft(tx, documentId, userId);
      await tx.medicalDocument.delete({ where: { id: d.id } });
      await audit({ userId, action: "delete", entity: "document", entityId: d.id, patientId: d.patientId, details: d.title }, tx);
    }, EMR_TX);
    return success("დრაფტი წაიშალა");
  } catch (error) {
    return emrFailure(error);
  }
}

const signSchema = z.object({
  documentId: idSchema,
  values: valuesSchema,
  signatures: z
    .array(
      z.object({
        role: z.enum(["doctor", "patient"]),
        png: z.string().startsWith("data:image/png;base64,", "ხელმოწერის ფორმატი არასწორია").max(800_000, "ხელმოწერის ფაილი ძალიან დიდია"),
        device: z.string().regex(DEVICE_ID_PATTERN, "მოწყობილობა არასწორია"),
      }),
    )
    .max(2),
});
export type SignInput = z.input<typeof signSchema>;

/** PNG-ის შემოწმება: ხელმოწერა (data URL) → ბაიტები; ზომა და გაფართოება — გონივრულ ფარგლებში. */
function decodeSignature(dataUrl: string): Uint8Array {
  const bytes = new Uint8Array(Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_SIGNATURE_BYTES || detectMimeType(bytes) !== "image/png") {
    throw new EmrError("ხელმოწერის სურათი არასწორია — მოაწერეთ თავიდან");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > 4000 || height > 2000) throw new EmrError("ხელმოწერის სურათის ზომა არასწორია");
  return bytes;
}

/**
 * ხელმოწერა: ველები მოწმდება (სავალდებულოებიც), იქმნება PDF ხელმოწერებით, ინახება პაციენტის ფაილებში,
 * დოკუმენტი იკეტება (sha256), წინა ვერსია — „ჩანაცვლებულია“. ყველაფერი ერთ ტრანზაქციაში;
 * ჩავარდნისას დისკზე ჩაწერილი ფაილები იშლება.
 */
export async function signDocumentAction(input: SignInput): Promise<ActionResult> {
  const me = await requirePermission("emr.edit", "documents.sign");
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const userId = Number(me.id);
  const stored: string[] = [];

  try {
    const signatures = parsed.data.signatures.map((s) => ({ ...s, bytes: decodeSignature(s.png) }));
    if (new Set(signatures.map((s) => s.role)).size !== signatures.length) throw new EmrError("ხელმოწერა ორჯერაა");

    const title = await prisma.$transaction(async (tx) => {
      const d = await lockOwnDraft(tx, parsed.data.documentId, userId);
      const template = DOCUMENT_TEMPLATES[d.type];
      const checked = validateDocumentValues(d.type, parsed.data.values, true);
      if (!checked.ok) throw new EmrError("შეავსეთ სავალდებულო ველები", checked.errors);
      for (const s of template.signers) {
        if (s.required && !signatures.some((x) => x.role === s.role)) {
          throw new EmrError(s.role === "doctor" ? "საჭიროა ექიმის ხელმოწერა" : "საჭიროა პაციენტის ხელმოწერა");
        }
      }
      const allowed = new Set(template.signers.map((s) => s.role));
      if (signatures.some((s) => !allowed.has(s.role))) throw new EmrError("ამ დოკუმენტს ეს ხელმომწერი არ აქვს");

      const now = new Date();
      await tx.medicalDocument.update({ where: { id: d.id }, data: { content: serializeContent(checked.values), signedAt: now } });
      const base = await loadPdfInput(tx, d.id);
      if (!base) throw new EmrError("დოკუმენტი ვერ მოიძებნა");
      const signedAt = `${formatDate(tbilisiParts(now).date)} ${formatTime(now)}`;
      const signerName = (role: "doctor" | "patient") => (role === "doctor" ? base.doctor.name : base.patient.name);

      const pdf = await renderDocumentPdf({
        ...base,
        draft: false,
        signatures: signatures.map((s) => ({ role: s.role, name: signerName(s.role), png: s.bytes, signedAt })),
      });
      const sha256 = createHash("sha256").update(pdf).digest("hex");

      for (const s of signatures) stored.push(await storeDocument(s.bytes, "image/png"));
      const pdfPath = await storeDocument(pdf, "application/pdf");
      stored.push(pdfPath);

      const file = await tx.patientDocument.create({
        data: {
          patientId: d.patientId,
          docType: "medical",
          title: `${template.title} N ${d.id}${d.version > 1 ? ` (ვერსია ${d.version})` : ""}`,
          originalName: `document-${d.id}-v${d.version}.pdf`,
          storagePath: pdfPath,
          mimeType: "application/pdf",
          sizeBytes: pdf.byteLength,
          uploadedById: userId,
        },
        select: { id: true },
      });
      // ჩაკეტვა: მხოლოდ დრაფტიდან (ერთდროული ხელმოწერისას ერთი გაივლის)
      const { count } = await tx.medicalDocument.updateMany({
        where: { id: d.id, status: "draft" },
        data: { status: "signed", pdfDocumentId: file.id, sha256, signedAt: now },
      });
      if (!count) throw new EmrError("დოკუმენტი ამასობაში შეიცვალა — განაახლეთ გვერდი");
      await tx.documentSignature.createMany({
        data: signatures.map((s, i) => ({
          documentId: d.id,
          signerRole: s.role,
          signerName: signerName(s.role),
          signerUserId: s.role === "doctor" ? userId : null,
          imagePath: stored[i],
          device: s.device,
          signedAt: now,
        })),
      });
      if (d.previousId) {
        await tx.medicalDocument.updateMany({ where: { id: d.previousId, status: "signed" }, data: { status: "superseded" } });
      }
      await audit(
        {
          userId,
          action: "sign",
          entity: "document",
          entityId: d.id,
          patientId: d.patientId,
          details: `${template.title}, ვერსია ${d.version}, ხელმომწერები: ${signatures.map((s) => s.role).join("+")}, sha256 ${sha256.slice(0, 16)}…`,
        },
        tx,
      );
      return template.title;
    }, EMR_TX);
    return success(`ხელმოწერილია: ${title}`);
  } catch (error) {
    if (stored.length) await removeDocuments(stored);
    return emrFailure(error);
  }
}

/** ახალი ვერსია ხელმოწერილი დოკუმენტიდან (შესწორებისთვის): დრაფტი იმავე ველებით, previous → ძველი. */
export async function newVersionAction(documentId: number): Promise<ActionResult & { documentId?: number }> {
  const me = await requirePermission("emr.edit");
  if (!idSchema.safeParse(documentId).success) return failure("დოკუმენტი ვერ მოიძებნა");
  const userId = Number(me.id);
  try {
    const id = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM medical_documents WHERE id = ${documentId} FOR UPDATE`;
      const d = await tx.medicalDocument.findUnique({ where: { id: documentId }, include: { next: { select: { id: true } } } });
      if (!d) throw new EmrError("დოკუმენტი ვერ მოიძებნა");
      if (d.createdById !== userId) throw new EmrError("ახალ ვერსიას ქმნის დოკუმენტის ავტორი");
      if (d.status !== "signed") throw new EmrError("ახალი ვერსია იქმნება მხოლოდ მოქმედი ხელმოწერილი დოკუმენტიდან");
      if (d.next) throw new EmrError("ახალი ვერსია უკვე არსებობს");
      const created = await tx.medicalDocument.create({
        data: {
          patientId: d.patientId,
          encounterId: d.encounterId,
          type: d.type,
          version: d.version + 1,
          previousId: d.id,
          title: d.title,
          content: d.content,
          createdById: userId,
          createdAt: new Date(),
        },
        select: { id: true },
      });
      await audit({ userId, action: "new_version", entity: "document", entityId: created.id, patientId: d.patientId, details: `წინა: N ${d.id}` }, tx);
      return created.id;
    }, EMR_TX);
    return { ...success("შეიქმნა ახალი ვერსია (დრაფტი) — შეასწორეთ და მოაწერეთ ხელი"), documentId: id };
  } catch (error) {
    if (isUniqueViolation(error)) return failure("ახალი ვერსია უკვე არსებობს");
    return emrFailure(error);
  }
}

/** მთლიანობის შემოწმება: შენახული PDF-ის sha256 ემთხვევა თუ არა ხელმოწერისას დაფიქსირებულს. */
export async function verifyDocumentAction(documentId: number): Promise<ActionResult> {
  const me = await requirePermission("emr.view");
  if (!idSchema.safeParse(documentId).success) return failure("დოკუმენტი ვერ მოიძებნა");
  const d = await prisma.medicalDocument.findUnique({ where: { id: documentId }, include: { pdf: { select: { storagePath: true } } } });
  if (!d?.pdf || !d.sha256) return failure("დოკუმენტი ხელმოწერილი არ არის");
  let actual: string;
  try {
    actual = createHash("sha256").update(await readDocument(d.pdf.storagePath)).digest("hex");
  } catch {
    return failure("PDF ფაილი ვერ მოიძებნა საცავში");
  }
  const ok = actual === d.sha256;
  await audit({ userId: Number(me.id), action: "verify", entity: "document", entityId: d.id, patientId: d.patientId, details: ok ? "OK" : "MISMATCH" });
  return ok ? success("დოკუმენტი ხელუხლებელია — PDF ემთხვევა ხელმოწერილს") : failure("⚠ PDF შეცვლილია ხელმოწერის შემდეგ!");
}
