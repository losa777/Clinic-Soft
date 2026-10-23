import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, formatTime, tbilisiParts } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { GENDERS } from "@/lib/patient-schema";
import type { DocumentPdfInput } from "@/modules/emr/documents/pdf";
import { DOCUMENT_TEMPLATES, type DocumentTypeCode, isDocumentType, type PrefillContext } from "@/modules/emr/documents/templates";
import { loadSettings } from "@/modules/finance/server/receipts";
import { loadStampBytes } from "@/modules/finance/server/stamp";
import { formatCardNumber } from "./card";
import { formatMeasurementsOf } from "./measurements";
import { ageOf } from "./patient-card";

type Db = Prisma.TransactionClient;

const dateTime = (d: Date) => `${formatDate(tbilisiParts(d).date)} ${formatTime(d)}`;
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}` : null);

/** content სვეტი: {"values": {...}} — შაბლონის ველები. */
export function parseContent(content: string): Record<string, string> {
  try {
    const values = (JSON.parse(content) as { values?: unknown }).values;
    if (!values || typeof values !== "object") return {};
    return Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

export const serializeContent = (values: Record<string, string>) => JSON.stringify({ values });

export type MedicalDocumentRow = Awaited<ReturnType<typeof loadMedicalDocuments>>[number];

/** პაციენტის სამედიცინო დოკუმენტები (ბოლო 100, ახალი პირველი) — idx_medical_documents_patient. */
export async function loadMedicalDocuments(patientId: number) {
  const docs = await prisma.medicalDocument.findMany({
    where: { patientId },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      next: { select: { id: true, version: true } },
      signatures: { select: { signerRole: true, signerName: true, signedAt: true, device: true }, orderBy: { id: "asc" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return docs
    .filter((d) => isDocumentType(d.type))
    .map((d) => ({
      id: d.id,
      type: d.type as DocumentTypeCode,
      title: d.title,
      version: d.version,
      status: d.status,
      encounterId: d.encounterId,
      createdById: d.createdById,
      createdBy: fullName(d.createdBy),
      createdAt: dateTime(d.createdAt),
      signedAt: d.signedAt ? dateTime(d.signedAt) : null,
      pdfDocumentId: d.pdfDocumentId,
      docNumber: d.docNumber,
      next: d.next,
      // დრაფტის რედაქტირებისთვის; ხელმოწერილის შიგთავსი PDF-შია
      values: d.status === "draft" ? parseContent(d.content) : null,
      signatures: d.signatures.map((s) => ({ role: s.signerRole, name: s.signerName, signedAt: dateTime(s.signedAt), device: s.device })),
    }));
}

/** DD/MM/YYYY (ფორმა 100-ის ფორმატი, თბილისის დროით) */
const slashDate = (d: Date) => formatDate(tbilisiParts(d).date).replaceAll(".", "/");
const slashDateTime = (d: Date) => `${slashDate(d)} ${formatTime(d)}`;

/** ავტომატური შევსების მონაცემები ვიზიტიდან (დიაგნოზები, ტექსტები, ვიტალური, რეცეპტი, კვლევები, პროცედურები). */
export async function loadPrefillContext(db: Db, encounterId: number): Promise<PrefillContext | null> {
  const e = await db.encounter.findUnique({
    where: { id: encounterId },
    include: {
      patient: {
        select: {
          actualAddress: true,
          legalAddress: true,
          conditions: { where: { isActive: true }, select: { icd10Code: true, name: true }, orderBy: { id: "asc" } },
        },
      },
      diagnoses: { include: { icd10: { select: { nameKa: true } } }, orderBy: [{ isPrimary: "desc" }, { isComplication: "desc" }, { id: "asc" }] },
      prescriptions: { orderBy: { id: "asc" } },
      orders: { where: { status: { not: "cancelled" } }, include: { service: { select: { code: true } } }, orderBy: { id: "asc" } },
      appointment: { select: { doctor: { select: { consultationService: { select: { name: true, code: true } } } } } },
    },
  });
  if (!e) return null;
  const vitals = [
    e.bpSystolic && e.bpDiastolic && `წნევა ${e.bpSystolic}/${e.bpDiastolic}`,
    e.pulse && `პულსი ${e.pulse}`,
    e.temperature && `ტ° ${e.temperature.toString()}`,
    e.spo2 && `SpO₂ ${e.spo2}%`,
    e.respRate && `სუნთქვა ${e.respRate}/წთ`,
    e.weightKg && `წონა ${e.weightKg.toString()} კგ`,
    e.heightCm && `სიმაღლე ${e.heightCm.toString()} სმ`,
  ].filter(Boolean);
  const orderDate = (o: { performedAt: Date | null; createdAt: Date }) => slashDate(o.performedAt ?? o.createdAt);
  const result = (text: string | null) => (text ? ` — ${text.replace(/\s+/g, " ").slice(0, 300)}` : "");
  const consultation = e.appointment.doctor.consultationService;
  const measurements = (await formatMeasurementsOf(db, [e.id])).get(e.id) ?? [];
  return {
    visitDate: tbilisiParts(e.startedAt).date,
    visitStart: slashDateTime(e.startedAt),
    visitEnd: e.completedAt ? slashDateTime(e.completedAt) : null,
    patient: {
      address: e.patient.actualAddress ?? e.patient.legalAddress,
      conditions: e.patient.conditions.map((c) => (c.icd10Code ? `${c.icd10Code} ${c.name}` : c.name)),
    },
    diagnoses: e.diagnoses.map((d) => ({ code: d.icd10Code, name: d.icd10.nameKa, primary: d.isPrimary, complication: d.isComplication })),
    complaints: e.complaints,
    anamnesisDisease: e.anamnesisDisease,
    examination: e.examination,
    treatmentPlan: e.treatmentPlan,
    recommendations: e.recommendations,
    vitals: vitals.length ? vitals.join(", ") : null,
    prescriptions: e.prescriptions.map((p) => [p.drugName, p.dose, p.frequency, p.duration].filter(Boolean).join(", ")),
    studies: e.orders
      .filter((o) => o.type !== "procedure")
      .map((o) => (o.resultText ? `${o.serviceName}: ${o.resultText.replace(/\s+/g, " ").slice(0, 300)}` : o.serviceName)),
    // ნიმუშის მიხედვით: „სერვისი კოდი თარიღი“ (კვლევები, კონსულტაცია) და „კოდი სერვისი თარიღი“ (პროცედურები)
    studiesDated: [
      ...e.orders
        .filter((o) => o.type !== "procedure")
        .map((o) => `${o.serviceName}${o.service.code ? ` ${o.service.code}` : ""} ${orderDate(o)}${result(o.resultText)}`),
      ...(consultation ? [`${consultation.name}${consultation.code ? ` ${consultation.code}` : ""} ${slashDate(e.startedAt)}`] : []),
    ],
    proceduresDated: e.orders
      .filter((o) => o.type === "procedure")
      .map((o) => `${o.service.code ? `${o.service.code} ` : ""}${o.serviceName} ${orderDate(o)}${result(o.resultText)}`),
    measurements,
    medicationRows: e.prescriptions.map((p) => ({
      drug: [p.drugName, p.form && `(${p.form})`, p.dose].filter(Boolean).join(" "),
      note: [p.frequency, p.note].filter(Boolean).join(", "),
      duration: p.duration ?? "",
      quantity: p.quantity ? String(p.quantity) : "",
      rxNumber: p.rxNumber ?? "",
    })),
  };
}

/**
 * PDF-ის მონაცემები (ხელმოწერების გარეშე): კლინიკა, პაციენტი (ბარათით, ასაკით), ავტორი-ექიმი, ხელმძღვანელი, თარიღი, ნომერი,
 * ველები. withStamp — ბეჭედი (თუ შაბლონს აქვს და ატვირთულია).
 */
export async function loadPdfInput(
  db: Db,
  documentId: number,
  { withStamp = false }: { withStamp?: boolean } = {},
): Promise<Omit<DocumentPdfInput, "draft" | "signatures"> | null> {
  const d = await db.medicalDocument.findUnique({
    where: { id: documentId },
    include: {
      patient: { select: { firstName: true, lastName: true, personalId: true, birthDate: true, gender: true, cardNumber: true, cardYear: true } },
      createdBy: { select: { firstName: true, lastName: true, doctorProfile: { select: { specialty: { select: { name: true } } } } } },
    },
  });
  if (!d || !isDocumentType(d.type)) return null;
  const [settings, stamp] = await Promise.all([
    loadSettings(),
    withStamp && DOCUMENT_TEMPLATES[d.type].stamp ? loadStampBytes() : Promise.resolve(null),
  ]);
  return {
    type: d.type,
    documentId: d.id,
    version: d.version,
    date: formatDate(tbilisiParts(d.signedAt ?? new Date()).date),
    docNumber: d.docNumber,
    clinic: { name: settings.clinic_name, address: settings.clinic_address || null, phone: settings.clinic_phone || null },
    patient: {
      name: `${d.patient.firstName} ${d.patient.lastName}`,
      personalId: d.patient.personalId,
      birthDate: formatDate(d.patient.birthDate.toISOString().slice(0, 10)),
      age: ageOf(d.patient.birthDate),
      gender: GENDERS.find((g) => g.value === d.patient.gender)?.label ?? null,
      cardNumber: formatCardNumber(d.patient),
    },
    doctor: { name: fullName(d.createdBy) ?? "—", specialty: d.createdBy?.doctorProfile?.specialty.name ?? null },
    head: { name: settings.clinic_head_name || null },
    values: parseContent(d.content),
    stamp,
  };
}

export const documentTitle = (type: DocumentTypeCode) => DOCUMENT_TEMPLATES[type].title;
