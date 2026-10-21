import "server-only";
import { prisma } from "@/lib/db";
import type { DoctorOption, ServiceOption, VisitEditData, VisitRow } from "@/lib/visit-schema";

/** მიღების ფორმის არჩევანი: ყველა სერვისი და აქტიური ექიმები (სია პატარაა, ძებნა კლიენტზე ხდება). */
export async function loadVisitOptions(): Promise<{ services: ServiceOption[]; doctors: DoctorOption[] }> {
  const [services, doctors] = await Promise.all([
    prisma.service.findMany({ orderBy: [{ code: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({
      where: { isActive: true, role: { code: "doctor" } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  return {
    services: services.map((s) => ({ id: s.id, code: s.code, name: s.name, price: s.price.toFixed(2) })),
    doctors: doctors.map((d) => ({ id: d.id, name: `${d.firstName} ${d.lastName}` })),
  };
}

const dateTimeFormat = new Intl.DateTimeFormat("ka-GE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tbilisi",
});

const userName = { select: { firstName: true, lastName: true } } as const;
const fullName = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : null);

/** პაციენტის ვიზიტები, ახალი პირველი (გაუქმებულიც, აღნიშვნით). */
export async function loadPatientVisits(patientId: number): Promise<VisitRow[]> {
  const visits = await prisma.visit.findMany({
    where: { patientId },
    include: {
      services: { orderBy: { id: "asc" } },
      payments: { orderBy: { id: "asc" }, include: { createdBy: userName } },
      createdBy: userName,
      updatedBy: userName,
      cancelledBy: userName,
    },
    orderBy: [{ visitAt: "desc" }, { id: "desc" }],
  });

  return visits.map((v) => ({
    id: v.id,
    visitAt: dateTimeFormat.format(v.visitAt),
    doctorName: v.doctorName,
    visitType: v.visitType,
    services: v.services.map((s) => ({ code: s.serviceCode, name: s.serviceName, price: s.price.toFixed(2) })),
    payments: v.payments.map((p) => ({
      amount: p.amount.toFixed(2),
      method: p.method,
      createdAt: dateTimeFormat.format(p.createdAt),
      createdBy: fullName(p.createdBy),
    })),
    totalAmount: v.totalAmount.toFixed(2),
    paidAmount: v.paidAmount.toFixed(2),
    debt: v.totalAmount.minus(v.paidAmount).toFixed(2),
    comment: v.comment,
    createdBy: fullName(v.createdBy),
    createdAt: dateTimeFormat.format(v.createdAt),
    updated: v.updatedById ? { by: fullName(v.updatedBy), at: dateTimeFormat.format(v.updatedAt) } : null,
    cancelled:
      v.status === "cancelled"
        ? { reason: v.cancelReason ?? "", by: fullName(v.cancelledBy), at: v.cancelledAt ? dateTimeFormat.format(v.cancelledAt) : "" }
        : null,
  }));
}

/** ვიზიტი რედაქტირების ფორმისთვის; null — არ არსებობს, სხვა პაციენტისაა ან გაუქმებულია. */
export async function loadVisitForEdit(patientId: number, visitId: number): Promise<VisitEditData | null> {
  const v = await prisma.visit.findFirst({
    where: { id: visitId, patientId, status: "active" },
    include: { services: { orderBy: { id: "asc" } } },
  });
  if (!v) return null;

  return {
    visitId: v.id,
    doctor: v.doctorId ? { id: v.doctorId, name: v.doctorName } : null,
    // თბილისის დრო (UTC+4) datetime-local ველისთვის
    visitAt: new Date(v.visitAt.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16),
    visitType: v.visitType,
    items: v.services.map((s) => ({
      key: `vs-${s.id}`,
      visitServiceId: s.id,
      serviceId: s.serviceId,
      code: s.serviceCode,
      name: s.serviceName,
      price: s.price.toFixed(2),
    })),
    comment: v.comment ?? "",
    paidAmount: v.paidAmount.toFixed(2),
  };
}
