import "server-only";
import type { OrderStatus, OrderType, Prisma } from "@/generated/prisma/client";
import { formatDate, formatTime, tbilisiParts } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { loadSettings } from "@/modules/finance/server/receipts";

const dateTime = (d: Date) => `${formatDate(tbilisiParts(d).date)} ${formatTime(d)}`;
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}` : null);

export type OrderOption = { id: number; label: string; category: string };

/** დასანიშნი სერვისები ტიპის მიხედვით: აქტიური სერვისები, რომელთა კატეგორიას დანიშნულების ტიპი აქვს. */
export async function loadOrderOptions(): Promise<Record<OrderType, OrderOption[]>> {
  const services = await prisma.service.findMany({
    where: { isActive: true, category: { orderType: { not: null } } },
    select: { id: true, code: true, name: true, category: { select: { name: true, orderType: true } } },
    orderBy: { name: "asc" },
  });
  const result: Record<OrderType, OrderOption[]> = { lab: [], instrumental: [], procedure: [] };
  for (const s of services) {
    result[s.category!.orderType!].push({ id: s.id, label: s.code ? `${s.code} — ${s.name}` : s.name, category: s.category!.name });
  }
  return result;
}

export type EncounterOrders = Awaited<ReturnType<typeof loadEncounterOrders>>;

/** ვიზიტის დანიშნულებები: რეცეპტი და კვლევები/პროცედურები სტატუსებით. */
export async function loadEncounterOrders(encounterId: number) {
  const [prescriptions, orders] = await Promise.all([
    prisma.prescription.findMany({ where: { encounterId }, orderBy: { id: "asc" } }),
    prisma.medicalOrder.findMany({
      where: { encounterId },
      include: { performedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { id: "asc" },
    }),
  ]);
  return {
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      drugName: p.drugName,
      dose: p.dose,
      form: p.form,
      frequency: p.frequency,
      duration: p.duration,
      note: p.note,
      quantity: p.quantity,
      rxNumber: p.rxNumber,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      type: o.type,
      name: o.serviceName,
      status: o.status,
      note: o.note,
      resultText: o.resultText,
      resultDocumentId: o.resultDocumentId,
      performedBy: fullName(o.performedBy),
      performedAt: o.performedAt ? dateTime(o.performedAt) : null,
    })),
  };
}

export const QUEUE_PAGE_SIZE = 30;

export type QueueRow = {
  id: number;
  type: OrderType;
  /** ნორმისთვის (საწყობი: შესრულებისას გასახარჯი მასალა) */
  serviceId: number;
  name: string;
  status: OrderStatus;
  note: string | null;
  orderedAt: string;
  orderedBy: string | null;
  patient: { name: string; personalId: string; birthDate: string };
  resultText: string | null;
  resultDocumentId: number | null;
  performedAt: string | null;
  performedBy: string | null;
};

/**
 * ლაბორანტის/ექთნის რიგი: types, statuses — ფილტრი; ძველი პირველი (FIFO). ინდექსი: (type, status, created_at).
 */
export async function loadQueue({ types, statuses, page }: { types: OrderType[]; statuses: OrderStatus[]; page: number }) {
  const where: Prisma.MedicalOrderWhereInput = { type: { in: types }, status: { in: statuses } };
  const total = await prisma.medicalOrder.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const done = statuses.some((s) => s === "ready" || s === "done");
  const orders = await prisma.medicalOrder.findMany({
    where,
    include: {
      patient: { select: { firstName: true, lastName: true, personalId: true, birthDate: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      performedBy: { select: { firstName: true, lastName: true } },
    },
    // მიმდინარე — ძველი პირველი (რიგი); შესრულებული — ახალი პირველი
    orderBy: [{ createdAt: done ? "desc" : "asc" }, { id: done ? "desc" : "asc" }],
    skip: (current - 1) * QUEUE_PAGE_SIZE,
    take: QUEUE_PAGE_SIZE,
  });
  return {
    total,
    page: current,
    pageCount,
    rows: orders.map(
      (o): QueueRow => ({
        id: o.id,
        type: o.type,
        serviceId: o.serviceId,
        name: o.serviceName,
        status: o.status,
        note: o.note,
        orderedAt: dateTime(o.createdAt),
        orderedBy: fullName(o.createdBy),
        patient: {
          name: `${o.patient.firstName} ${o.patient.lastName}`,
          personalId: o.patient.personalId,
          birthDate: formatDate(o.patient.birthDate.toISOString().slice(0, 10)),
        },
        resultText: o.resultText,
        resultDocumentId: o.resultDocumentId,
        performedAt: o.performedAt ? dateTime(o.performedAt) : null,
        performedBy: fullName(o.performedBy),
      }),
    ),
  };
}

/** რეცეპტის ბეჭდვის მონაცემები: კლინიკა, პაციენტი, ექიმი, ძირითადი დიაგნოზი, მედიკამენტები. */
export async function loadPrescriptionPrint(encounterId: number) {
  const e = await prisma.encounter.findUnique({
    where: { id: encounterId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, personalId: true, birthDate: true } },
      doctor: { select: { firstName: true, lastName: true, doctorProfile: { select: { specialty: { select: { name: true } } } } } },
      diagnoses: { where: { isPrimary: true }, include: { icd10: { select: { nameKa: true } } } },
      prescriptions: { orderBy: { id: "asc" } },
    },
  });
  if (!e) return null;
  const settings = await loadSettings();
  return {
    clinic: { name: settings.clinic_name, address: settings.clinic_address, phone: settings.clinic_phone },
    encounterId: e.id,
    date: formatDate(tbilisiParts(e.startedAt).date),
    patient: {
      id: e.patient.id,
      name: `${e.patient.firstName} ${e.patient.lastName}`,
      personalId: e.patient.personalId,
      birthDate: formatDate(e.patient.birthDate.toISOString().slice(0, 10)),
    },
    doctor: { name: `${e.doctor.firstName} ${e.doctor.lastName}`, specialty: e.doctor.doctorProfile?.specialty.name ?? null },
    diagnosis: e.diagnoses[0] ? `${e.diagnoses[0].icd10Code} — ${e.diagnoses[0].icd10.nameKa}` : null,
    items: e.prescriptions.map((p) => ({
      id: p.id,
      drugName: p.drugName,
      form: p.form,
      dose: p.dose,
      frequency: p.frequency,
      duration: p.duration,
      note: p.note,
      quantity: p.quantity,
      rxNumber: p.rxNumber,
    })),
  };
}
