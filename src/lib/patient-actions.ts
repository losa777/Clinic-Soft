"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requireAnyRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { detectMimeType, removeDocuments, storeDocument } from "@/lib/document-storage";
import { loadPatientRecord } from "@/lib/patient-records";
import {
  type AcceptedMimeType,
  type DocumentMeta,
  documentMetaSchema,
  formatFileSize,
  MAX_FILE_SIZE,
  MAX_FILES_PER_SAVE,
  MAX_TOTAL_UPLOAD,
  type PatientRecord,
  patientSchema,
  personalIdSchema,
} from "@/lib/patient-schema";
import { can } from "@/lib/permissions";
import { PATIENT_EDITOR_ROLE, PATIENT_REGISTRAR_ROLE, PATIENT_ROLES } from "@/lib/roles";
import { type NewPatientPolicy, newPatientPolicySchema } from "@/modules/finance/schema";
import { FinanceError } from "@/modules/finance/server/errors";
import { createPatientPolicy } from "@/modules/finance/server/insurance";

export type FindPatientResult = { ok: true; record: PatientRecord | null } | { ok: false; error: string };

export type PatientSaveResult =
  | { ok: true; message: string; record: PatientRecord }
  | ActionFailure;

const PERSONAL_ID_TAKEN = { personalId: "ამ პირადი ნომრით პაციენტი უკვე არსებობს" };
const EDITOR_ONLY = "არსებული პაციენტის მონაცემებს ცვლის მხოლოდ ადმინისტრატორი";

/** ძებნა პირადი ნომრით (UNIQUE ინდექსი). null = ახალი პაციენტი. */
export async function findPatient(personalId: string): Promise<FindPatientResult> {
  await requireAnyRole(...PATIENT_ROLES);
  const parsed = personalIdSchema.safeParse(personalId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return { ok: true, record: await loadPatientRecord({ personalId: parsed.data }) };
}

type Upload = DocumentMeta & { bytes: Uint8Array; mimeType: AcceptedMimeType; originalName: string };

/** FormData-დან ფაილები და მათი ტიპი/სახელი. შეცდომისას აბრუნებს ტექსტს. */
async function readUploads(formData: FormData): Promise<Upload[] | string> {
  const files = formData.getAll("files");
  let meta: unknown;
  try {
    meta = JSON.parse(String(formData.get("documents") ?? "[]"));
  } catch {
    meta = null;
  }
  const parsed = z.array(documentMetaSchema).safeParse(meta);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "დოკუმენტების მონაცემები არასწორია";
  if (parsed.data.length !== files.length || !files.every((f) => f instanceof File)) {
    return "დოკუმენტების მონაცემები არასწორია";
  }
  if (files.length > MAX_FILES_PER_SAVE) return `ერთ ჯერზე შეიძლება მაქსიმუმ ${MAX_FILES_PER_SAVE} ფაილის შენახვა`;
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_UPLOAD) {
    return `ფაილების ჯამური ზომა ${formatFileSize(MAX_TOTAL_UPLOAD)}-ს აღემატება`;
  }

  const uploads: Upload[] = [];
  for (const [i, file] of files.entries()) {
    const originalName = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(-255) || "document";
    if (file.size === 0) return `„${originalName}“ ცარიელია`;
    if (file.size > MAX_FILE_SIZE) return `„${originalName}“ ${formatFileSize(MAX_FILE_SIZE)}-ზე დიდია`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectMimeType(bytes);
    if (!mimeType) return `„${originalName}“: დასაშვებია მხოლოდ JPG, PNG ან PDF`;
    uploads.push({ ...parsed.data[i], bytes, mimeType, originalName });
  }
  return uploads;
}

/** ფაილების დისკზე ჩაწერა; ნაწილობრივი ჩავარდნისას უკვე ჩაწერილიც იშლება. */
async function storeUploads(uploads: Upload[], userId: number) {
  const stored: Omit<Prisma.PatientDocumentCreateManyInput, "patientId">[] = [];
  try {
    for (const u of uploads) {
      stored.push({
        docType: u.docType,
        title: u.title,
        originalName: u.originalName,
        storagePath: await storeDocument(u.bytes, u.mimeType),
        mimeType: u.mimeType,
        sizeBytes: u.bytes.byteLength,
        uploadedById: userId,
      });
    }
  } catch (error) {
    await removeDocuments(stored.map((s) => s.storagePath));
    throw error;
  }
  return stored;
}

/**
 * ახალი პაციენტის შექმნა ან (მხოლოდ ადმინი) არსებულის განახლება, ახალ დოკუმენტებთან ერთად.
 * ფაილები ჯერ დისკზე იწერება, შემდეგ პაციენტი და დოკუმენტები ერთ ტრანზაქციაში;
 * ტრანზაქციის ჩავარდნისას ჩაწერილი ფაილები იშლება, ასე რომ ობოლი ფაილი არ რჩება.
 */
export async function savePatient(formData: FormData): Promise<PatientSaveResult> {
  const me = await requireAnyRole(...PATIENT_ROLES);
  const userId = Number(me.id);
  const patientId = formData.get("patientId") ? Number(formData.get("patientId")) : null;
  if (patientId !== null && me.roleCode !== PATIENT_EDITOR_ROLE) return failure(EDITOR_ONLY);
  if (patientId === null && me.roleCode !== PATIENT_REGISTRAR_ROLE) return failure("ახალ პაციენტს არეგისტრირებს მხოლოდ რეგისტრატორი");

  let values: unknown;
  try {
    values = JSON.parse(String(formData.get("patient")));
  } catch {
    values = null;
  }
  const parsed = patientSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error);
  const data = { ...parsed.data, birthDate: new Date(`${parsed.data.birthDate}T00:00:00Z`) };

  // პოლისი — მხოლოდ ახალი პაციენტის რეგისტრაციისას (არსებულს ბარათის „დაზღვევის“ ჩანართიდან ემატება)
  const policy = patientId === null ? readPolicy(formData) : null;
  if (policy && "ok" in policy) return policy;
  if (policy && !can(me, "invoices.create") && !can(me, "insurance.manage")) return failure("პოლისის დამატების უფლება არ გაქვთ");

  const uploads = await readUploads(formData);
  if (typeof uploads === "string") return failure(uploads);
  const stored = await storeUploads(uploads, userId);

  let id: number;
  try {
    id = await prisma.$transaction(
      async (tx) => {
        const patient =
          patientId === null
            ? await tx.patient.create({ data: { ...data, createdById: userId, updatedById: userId } })
            : await tx.patient.update({ where: { id: patientId }, data: { ...data, updatedById: userId } });
        if (stored.length) {
          await tx.patientDocument.createMany({ data: stored.map((s) => ({ ...s, patientId: patient.id })) });
        }
        if (policy) await createPatientPolicy(tx, patient.id, policy, userId);
        return patient.id;
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    await removeDocuments(stored.map((s) => s.storagePath));
    if (error instanceof FinanceError) return failure(error.message, error.fieldErrors);
    if (isUniqueViolation(error)) return failure("პაციენტი უკვე არსებობს", PERSONAL_ID_TAKEN);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return failure("პაციენტი ვერ მოიძებნა");
    }
    throw error;
  }

  const record = (await loadPatientRecord({ id }))!;
  const docs = stored.length ? `, დოკუმენტი: ${stored.length}` : "";
  const insured = policy ? ", პოლისი დაემატა" : "";
  return { ok: true, message: (patientId === null ? "პაციენტი დარეგისტრირდა" : "ცვლილებები შენახულია") + docs + insured, record };
}

/** FormData-ს „policy“ (JSON): null — პაციენტი დაზღვეული არ არის; ActionFailure — ველები არასწორია. */
function readPolicy(formData: FormData): NewPatientPolicy | ActionFailure | null {
  const raw = formData.get("policy");
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return failure("პოლისის მონაცემები არასწორია");
  }
  const parsed = newPatientPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : invalid(parsed.error);
}

/** არსებულ პაციენტზე ახალი დოკუმენტების მიბმა (პაციენტის მონაცემები არ იცვლება). */
export async function addPatientDocuments(formData: FormData): Promise<PatientSaveResult> {
  const me = await requireAnyRole(...PATIENT_ROLES);
  const patientId = Number(formData.get("patientId"));
  if (!Number.isInteger(patientId) || !(await prisma.patient.count({ where: { id: patientId } }))) {
    return failure("პაციენტი ვერ მოიძებნა");
  }

  const uploads = await readUploads(formData);
  if (typeof uploads === "string") return failure(uploads);
  if (!uploads.length) return failure("ახალი დოკუმენტი არ არის");
  const stored = await storeUploads(uploads, Number(me.id));

  try {
    await prisma.patientDocument.createMany({ data: stored.map((s) => ({ ...s, patientId })) });
  } catch (error) {
    await removeDocuments(stored.map((s) => s.storagePath));
    throw error;
  }

  const record = (await loadPatientRecord({ id: patientId }))!;
  return { ok: true, message: `დოკუმენტები შენახულია: ${stored.length}`, record };
}

/** დოკუმენტის წაშლა (მხოლოდ ადმინი): ჯერ ჩანაწერი, შემდეგ ფაილი. */
export async function deletePatientDocument(id: number): Promise<ActionResult> {
  const me = await requireAnyRole(...PATIENT_ROLES);
  if (me.roleCode !== PATIENT_EDITOR_ROLE) return failure("დოკუმენტს შლის მხოლოდ ადმინისტრატორი");

  const doc = await prisma.patientDocument.findUnique({
    where: { id },
    include: { _count: { select: { medicalDocuments: true, orderResults: true } } },
  });
  if (!doc) return failure("დოკუმენტი ვერ მოიძებნა");
  // ხელმოწერილი სამედიცინო დოკუმენტის PDF და კვლევის შედეგი სამედიცინო ჩანაწერის ნაწილია — არ იშლება
  if (doc._count.medicalDocuments > 0) return failure("ხელმოწერილი სამედიცინო დოკუმენტი არ იშლება — შექმენით ახალი ვერსია");
  if (doc._count.orderResults > 0) return failure("კვლევის შედეგის ფაილი არ იშლება");
  await prisma.patientDocument.delete({ where: { id } });
  await removeDocuments([doc.storagePath]);
  return success("დოკუმენტი წაიშალა");
}
