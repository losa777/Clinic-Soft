import "server-only";
import { formatDate, formatTime, tbilisiParts } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import type { TemplateFieldCode } from "@/modules/emr/schema";
import type { VitalKey } from "@/modules/emr/vitals";
import { loadEncounterMeasurements } from "./measurements";

const num = (v: { toNumber(): number } | number | null) => (v === null ? null : typeof v === "number" ? v : v.toNumber());

export type EncounterFormData = NonNullable<Awaited<ReturnType<typeof loadEncounterForm>>>;

/** ვიზიტის ფორმა: ტექსტები, ვიტალური, დიაგნოზები. editable — საკუთარი და დაუსრულებელი (სხვისი — მხოლოდ სანახავად). */
export async function loadEncounterForm(encounterId: number, viewerUserId: number) {
  const e = await prisma.encounter.findUnique({
    where: { id: encounterId },
    include: {
      doctor: { select: { firstName: true, lastName: true } },
      diagnoses: { include: { icd10: { select: { nameKa: true } } }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
    },
  });
  if (!e) return null;
  const vitals: Record<VitalKey, number | null> = {
    bpSystolic: e.bpSystolic,
    bpDiastolic: e.bpDiastolic,
    pulse: e.pulse,
    temperature: num(e.temperature),
    spo2: e.spo2,
    respRate: e.respRate,
    weightKg: num(e.weightKg),
    heightCm: num(e.heightCm),
  };
  const measurements = await loadEncounterMeasurements(prisma, encounterId);
  return {
    id: e.id,
    version: e.version,
    status: e.status,
    editable: e.doctorId === viewerUserId && e.status === "draft",
    /** „საოპერაციოა“ — საკუთარ ვიზიტზე ინიშნება დასრულების შემდეგაც (ანგარიშგება) */
    surgical: { value: e.isSurgical, own: e.doctorId === viewerUserId, uploaded: e.portalUploadedAt !== null },
    doctor: `${e.doctor.firstName} ${e.doctor.lastName}`,
    startedAt: `${formatDate(tbilisiParts(e.startedAt).date)} ${formatTime(e.startedAt)}`,
    savedAt: formatTime(e.updatedAt),
    texts: {
      complaints: e.complaints ?? "",
      anamnesisDisease: e.anamnesisDisease ?? "",
      anamnesisLife: e.anamnesisLife ?? "",
      examination: e.examination ?? "",
      treatmentPlan: e.treatmentPlan ?? "",
      recommendations: e.recommendations ?? "",
    },
    vitals,
    diagnoses: e.diagnoses.map((d) => ({ code: d.icd10Code, name: d.icd10.nameKa, primary: d.isPrimary, complication: d.isComplication })),
    /** სპეციალობის მაჩვენებლები და მათი მნიშვნელობები; showCommonVitals — საერთო ვიტალური ჩანს თუ არა */
    measurements,
  };
}

export type DoctorTemplateRow = { id: number; field: TemplateFieldCode; title: string; content: string };

/** ექიმის შაბლონები (საკუთარი) — idx_doctor_templates_user. */
export async function loadTemplates(userId: number): Promise<DoctorTemplateRow[]> {
  const rows = await prisma.doctorTemplate.findMany({
    where: { userId },
    select: { id: true, field: true, title: true, content: true },
    orderBy: [{ field: "asc" }, { title: "asc" }],
    take: 500,
  });
  return rows;
}
