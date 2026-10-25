import "server-only";
import { formatDate, formatTime, tbilisiParts, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { formatCardNumber } from "./card";
import { formatMeasurementsOf } from "./measurements";
import { documentTypeLabel, GENDERS } from "@/lib/patient-schema";

/**
 * პაციენტის ბარათი ექიმისთვის (EMR): ძირითადი მონაცემები (მხოლოდ წასაკითხი), სამედიცინო პროფილი, ისტორია,
 * კვლევები, ფაილები. ყველა სია — ინდექსით და ლიმიტით/გვერდებით. უფლებას და აუდიტს გამომძახებელი ამოწმებს/წერს.
 */

const dateTime = (d: Date) => `${formatDate(tbilisiParts(d).date)} ${formatTime(d)}`;
const day = (d: Date) => formatDate(d.toISOString().slice(0, 10));
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}` : null);

export function ageOf(birthDate: Date): number {
  const [y, m, d] = tbilisiToday().split("-").map(Number);
  const b = birthDate;
  let age = y - b.getUTCFullYear();
  if (m < b.getUTCMonth() + 1 || (m === b.getUTCMonth() + 1 && d < b.getUTCDate())) age--;
  return age;
}

export type PatientCard = Awaited<ReturnType<typeof loadPatientCard>>;

export async function loadPatientCard(patientId: number) {
  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      allergies: { where: { isActive: true }, orderBy: [{ severity: "desc" }, { id: "asc" }] },
      conditions: { where: { isActive: true }, orderBy: { id: "asc" } },
      medications: { where: { isActive: true }, orderBy: { id: "asc" } },
    },
  });
  if (!p) return null;
  // ბოლო საოპერაციო ვიზიტი (ნიშანი ბარათის თავში) — idx_encounters_patient
  const surgical = await prisma.encounter.findFirst({
    where: { patientId, isSurgical: true },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, portalUploadedAt: true },
  });
  return {
    id: p.id,
    surgical: surgical ? { at: day(surgical.startedAt), uploaded: surgical.portalUploadedAt !== null } : null,
    name: `${p.firstName} ${p.lastName}`,
    personalId: p.personalId,
    birthDate: day(p.birthDate),
    age: ageOf(p.birthDate),
    gender: GENDERS.find((g) => g.value === p.gender)?.label ?? p.gender,
    phone: p.phone,
    address: p.actualAddress ?? p.legalAddress,
    bloodGroup: p.bloodGroup,
    cardNumber: formatCardNumber(p),
    allergies: p.allergies.map((a) => ({ id: a.id, substance: a.substance, reaction: a.reaction, severity: a.severity })),
    conditions: p.conditions.map((c) => ({
      id: c.id,
      icd10Code: c.icd10Code,
      name: c.name,
      since: c.since ? day(c.since) : null,
      note: c.note,
    })),
    medications: p.medications.map((m) => ({ id: m.id, drugName: m.drugName, dose: m.dose, frequency: m.frequency, note: m.note })),
  };
}

export const HISTORY_PAGE_SIZE = 20;

/** წინა ვიზიტები (ყველა ექიმის), ახალი პირველი — idx_encounters_patient. */
export async function loadEncounterHistory(patientId: number, page: number, viewerUserId: number) {
  const where = { patientId };
  const total = await prisma.encounter.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const encounters = await prisma.encounter.findMany({
    where,
    include: {
      doctor: { select: { firstName: true, lastName: true, doctorProfile: { select: { specialty: { select: { name: true } } } } } },
      diagnoses: { include: { icd10: { select: { nameKa: true } } }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    skip: (current - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
  });
  const measurements = await formatMeasurementsOf(prisma, encounters.map((e) => e.id));
  return {
    total,
    page: current,
    pageCount,
    rows: encounters.map((e) => ({
      id: e.id,
      appointmentId: e.appointmentId,
      at: dateTime(e.startedAt),
      status: e.status,
      doctor: fullName(e.doctor)!,
      specialty: e.doctor.doctorProfile?.specialty.name ?? null,
      own: e.doctorId === viewerUserId,
      surgical: e.isSurgical,
      portalUploaded: e.portalUploadedAt !== null,
      diagnoses: e.diagnoses.map((d) => ({ code: d.icd10Code, name: d.icd10.nameKa, primary: d.isPrimary, complication: d.isComplication })),
      complaints: e.complaints,
      examination: e.examination,
      treatmentPlan: e.treatmentPlan,
      recommendations: e.recommendations,
      measurements: measurements.get(e.id) ?? [],
    })),
  };
}

/** ლაბორატორიული და ინსტრუმენტული კვლევები (ბოლო 100) — idx_medical_orders_patient. */
export async function loadStudies(patientId: number) {
  const orders = await prisma.medicalOrder.findMany({
    where: { patientId, type: { in: ["lab", "instrumental"] } },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      resultDocument: { select: { id: true, title: true, mimeType: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return orders.map((o) => ({
    id: o.id,
    type: o.type,
    name: o.serviceName,
    status: o.status,
    orderedAt: dateTime(o.createdAt),
    orderedBy: fullName(o.createdBy),
    resultText: o.resultText,
    readyAt: o.performedAt ? dateTime(o.performedAt) : null,
    file: o.resultDocument,
  }));
}

/** ატვირთული ფაილები (ბოლო 100) — idx_patient_documents_patient_id. */
export async function loadFiles(patientId: number) {
  const docs = await prisma.patientDocument.findMany({
    where: { patientId },
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    type: documentTypeLabel(d.docType),
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    uploadedAt: dateTime(d.uploadedAt),
    uploadedBy: fullName(d.uploadedBy),
  }));
}
