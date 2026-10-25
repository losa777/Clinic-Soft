import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, formatTime, tbilisiParts } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { GENDERS } from "@/lib/patient-schema";
import { formatCardNumber } from "@/modules/emr/server/card";
import { ageOf } from "@/modules/emr/server/patient-card";
import { VITAL_KEYS, VITALS } from "@/modules/emr/vitals";
import { periodRange } from "@/modules/finance/server/db";
import type { ExportRow } from "@/modules/reporting/columns";
import type { ReportFilter } from "@/modules/reporting/filter";
import { loadMeasurementsText } from "./measurements";

/**
 * ანგარიშგების ხაზები: ერთი ხაზი = ერთი ვიზიტი (ვიზიტის თარიღით, ახალი პირველი). ყველა სვეტი ტექსტად —
 * ეკრანის ცხრილიც და Excel-იც ერთსა და იმავეს აჩვენებს. ფორმა 100 — ამ ვიზიტის ხელმოწერილი (მოქმედი ვერსია).
 */

export const EXPORT_MAX_ROWS = 5_000;

const dateTime = (d: Date | null) => (d ? `${formatDate(tbilisiParts(d).date)} ${formatTime(d)}` : "");
const day = (d: Date) => formatDate(d.toISOString().slice(0, 10));
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}` : "");
const num = (v: { toString(): string } | number | null) => (v === null ? null : Number(v.toString()));

export function reportWhere(f: ReportFilter): Prisma.EncounterWhereInput {
  // მონიშნული ვიზიტები: მხოლოდ ისინი (საოპერაციოს შეზღუდვა რჩება)
  if (f.ids) return { id: { in: f.ids }, ...(f.scope === "surgical" ? { isSurgical: true } : {}) };
  const period = periodRange(f.from, f.to);
  return {
    startedAt: { gte: period.from, lt: period.to },
    ...(f.scope === "surgical" ? { isSurgical: true } : {}),
    ...(f.portal === "pending" ? { portalUploadedAt: null } : f.portal === "uploaded" ? { portalUploadedAt: { not: null } } : {}),
    ...(f.doctorId ? { doctorId: f.doctorId } : {}),
  };
}

const VISIT_STATUS: Record<string, string> = { draft: "მიმდინარე", completed: "დასრულებული" };

export async function loadReportRows(f: ReportFilter, take: number, skip = 0): Promise<{ rows: ExportRow[]; total: number }> {
  const where = reportWhere(f);
  const [total, encounters] = await Promise.all([
    prisma.encounter.count({ where }),
    prisma.encounter.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take,
      skip,
      include: {
        patient: {
          include: {
            insurances: {
              where: { isActive: true },
              orderBy: { validTo: "desc" },
              select: { policyNumber: true, validFrom: true, validTo: true, company: { select: { name: true } } },
            },
          },
        },
        doctor: { select: { firstName: true, lastName: true } },
        specialty: { select: { name: true } },
        diagnoses: { include: { icd10: { select: { nameKa: true } } }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
        documents: {
          where: { type: "certificate_100", status: "signed" },
          orderBy: { signedAt: "desc" },
          select: { docNumber: true, signedAt: true },
        },
      },
    }),
  ]);

  const measurements = await loadMeasurementsText(prisma, encounters.map((e) => e.id));
  const rows = encounters.map((e): ExportRow => {
    const p = e.patient;
    const visitDay = e.startedAt.toISOString().slice(0, 10);
    // პოლისი, რომელიც ვიზიტის დღეს მოქმედებდა
    const policy = p.insurances.find((i) => i.validFrom.toISOString().slice(0, 10) <= visitDay && i.validTo.toISOString().slice(0, 10) >= visitDay);
    const primary = e.diagnoses.find((d) => d.isPrimary);
    const dx = (d: (typeof e.diagnoses)[number]) => `${d.icd10Code} ${d.icd10.nameKa}`;
    const vitals = VITAL_KEYS.flatMap((k) => {
      const v = num(e[k]);
      return v === null ? [] : [`${VITALS[k].label}: ${v} ${VITALS[k].unit}`];
    });
    return {
      encounterId: e.id,
      patientId: p.id,
      measurements: measurements.get(e.id) ?? "",
      lastName: p.lastName,
      firstName: p.firstName,
      fatherName: p.fatherName ?? "",
      lastNameEn: p.lastNameEn ?? "",
      firstNameEn: p.firstNameEn ?? "",
      personalId: p.personalId,
      birthDate: day(p.birthDate),
      age: String(ageOf(p.birthDate)),
      gender: GENDERS.find((g) => g.value === p.gender)?.label ?? p.gender,
      phone: p.phone ?? "",
      email: p.email ?? "",
      country: p.country ?? "",
      city: p.city ?? "",
      actualAddress: p.actualAddress ?? "",
      legalAddress: p.legalAddress ?? "",
      cardNumber: formatCardNumber(p) ?? "",
      insurance: policy ? `${policy.company.name}, ${policy.policyNumber}` : "",
      visitDate: dateTime(e.startedAt),
      completedAt: dateTime(e.completedAt),
      visitStatus: VISIT_STATUS[e.status] ?? e.status,
      doctor: fullName(e.doctor),
      specialty: e.specialty?.name ?? "",
      complaints: e.complaints ?? "",
      anamnesisDisease: e.anamnesisDisease ?? "",
      anamnesisLife: e.anamnesisLife ?? "",
      examination: e.examination ?? "",
      vitals: vitals.join("; "),
      treatmentPlan: e.treatmentPlan ?? "",
      recommendations: e.recommendations ?? "",
      primaryCode: primary?.icd10Code ?? "",
      primaryName: primary?.icd10.nameKa ?? "",
      complications: e.diagnoses.filter((d) => d.isComplication).map(dx).join("; "),
      concomitant: e.diagnoses.filter((d) => !d.isPrimary && !d.isComplication).map(dx).join("; "),
      surgical: e.isSurgical ? "კი" : "არა",
      surgicalMarkedAt: dateTime(e.surgicalMarkedAt),
      portalStatus: e.portalUploadedAt ? "ატვირთულია" : e.isSurgical ? "ასატვირთი" : "",
      portalUploadedAt: dateTime(e.portalUploadedAt),
      form100Number: e.documents.map((d) => d.docNumber).filter(Boolean).join(", "),
      form100Date: e.documents.map((d) => dateTime(d.signedAt)).filter(Boolean).join(", "),
    };
  });
  return { rows, total };
}

/** ექიმები ფილტრისთვის (ვისაც ვიზიტი აქვს) — ძებნა სახელით, გვარით ან სპეციალობით. */
export async function reportDoctors(): Promise<{ id: number; name: string; specialty: string }[]> {
  const doctors = await prisma.user.findMany({
    where: { encounters: { some: {} } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, doctorProfile: { select: { specialty: { select: { name: true } } } } },
  });
  return doctors.map((d) => ({ id: d.id, name: fullName(d), specialty: d.doctorProfile?.specialty.name ?? "" }));
}
