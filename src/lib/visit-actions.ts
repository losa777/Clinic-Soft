"use server";

import { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { requireAnyRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatGel } from "@/lib/money";
import { PATIENT_REGISTRAR_ROLE, PATIENT_ROLES } from "@/lib/roles";
import {
  type VisitCancelInput,
  type VisitInput,
  type VisitPaymentInput,
  type VisitUpdateInput,
  visitCancelSchema,
  visitPaymentSchema,
  visitSchema,
  visitUpdateSchema,
} from "@/lib/visit-schema";

export type VisitSaveResult = { ok: true; message: string; visitId: number } | ActionFailure;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const FIX_FIELDS = "შეასწორეთ მონიშნული ველები";
const NOT_EDITABLE = "ვიზიტი ვერ მოიძებნა ან გაუქმებულია";

function checkVisitAt(iso: string): Date | ActionFailure {
  const visitAt = new Date(iso);
  if (Math.abs(visitAt.getTime() - Date.now()) > YEAR_MS) {
    return failure(FIX_FIELDS, { visitAt: "თარიღი ერთ წელზე მეტადაა დაშორებული დღევანდელს" });
  }
  return visitAt;
}

async function findActiveDoctor(id: number) {
  return prisma.user.findFirst({
    where: { id, isActive: true, role: { code: "doctor" } },
    select: { id: true, firstName: true, lastName: true },
  });
}

/** სერვისის ICD-10 კოდი/დასახელება/ფასი ვიზიტში ამ მომენტის მდგომარეობით. */
const snapshot = (s: { id: number; code: string | null; name: string; price: Prisma.Decimal }) => ({
  serviceId: s.id,
  serviceCode: s.code,
  serviceName: s.name,
  price: s.price,
});

const paidExceedsTotal =(total: Prisma.Decimal) =>
  failure(FIX_FIELDS, { paidAmount: `გადახდილი თანხა ჯამს (${formatGel(total.toFixed(2))}) აღემატება` });

/**
 * პაციენტის მიღება. ფასები და ჯამი სერვერზე ითვლება ბაზის მიმდინარე ფასებით (კლიენტს არ ვენდობით);
 * სერვისის დასახელება/ფასი და ექიმის სახელი ვიზიტში ამ მომენტის მდგომარეობით იწერება.
 * გადახდილი თანხა (თუ > 0) პირველ გადახდად ინახება. მიღებას აკეთებს მხოლოდ რეგისტრატორი.
 */
export async function createVisit(input: VisitInput): Promise<VisitSaveResult> {
  const me = await requireAnyRole(PATIENT_REGISTRAR_ROLE);
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const visitAt = checkVisitAt(data.visitAt);
  if (!(visitAt instanceof Date)) return visitAt;

  const [patient, doctor, services] = await Promise.all([
    prisma.patient.count({ where: { id: data.patientId } }),
    findActiveDoctor(data.doctorId),
    prisma.service.findMany({ where: { id: { in: data.serviceIds } } }),
  ]);
  if (!patient) return failure("პაციენტი ვერ მოიძებნა");
  if (!doctor) return failure(FIX_FIELDS, { doctorId: "ექიმი ვერ მოიძებნა ან გათიშულია" });
  if (services.length !== data.serviceIds.length) {
    return failure(FIX_FIELDS, { serviceIds: "ზოგიერთი სერვისი აღარ არსებობს — განაახლეთ გვერდი" });
  }

  const total = services.reduce((sum, s) => sum.plus(s.price), new Prisma.Decimal(0));
  const paid = new Prisma.Decimal(data.paidAmount);
  if (paid.gt(total)) return paidExceedsTotal(total);

  const userId = Number(me.id);
  // სერვისები იმავე რიგით, როგორც ფორმაში აირჩიეს
  const byId = new Map(services.map((s) => [s.id, s]));
  const visit = await prisma.visit.create({
    data: {
      patientId: data.patientId,
      doctorId: doctor.id,
      doctorName: `${doctor.firstName} ${doctor.lastName}`,
      visitAt,
      visitType: data.visitType,
      totalAmount: total,
      paidAmount: paid,
      comment: data.comment,
      createdById: userId,
      services: {
        create: data.serviceIds.map((id) => snapshot(byId.get(id)!)),
      },
      ...(paid.gt(0) ? { payments: { create: { amount: paid, method: data.paymentMethod, createdById: userId } } } : {}),
    },
    select: { id: true },
  });

  return { ok: true, message: "პაციენტის მიღება დარეგისტრირდა", visitId: visit.id };
}

/**
 * ვიზიტის რედაქტირება: ექიმი, დრო, სერვისები, კომენტარი. ვიზიტში უკვე მყოფი სერვისი თავის ფასს ინარჩუნებს,
 * ახლად დამატებული — მიმდინარე ფასით. ახალი ჯამი გადახდილზე ნაკლები ვერ იქნება.
 */
export async function updateVisit(input: VisitUpdateInput): Promise<VisitSaveResult> {
  const me = await requireAnyRole(...PATIENT_ROLES);
  const parsed = visitUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const visitAt = checkVisitAt(data.visitAt);
  if (!(visitAt instanceof Date)) return visitAt;

  const visit = await prisma.visit.findFirst({ where: { id: data.visitId, status: "active" }, include: { services: true } });
  if (!visit) return failure(NOT_EDITABLE);

  // ექიმი: იგივე დარჩეს (თუნდაც უკვე გათიშული იყოს) ან ახალი აქტიური ექიმი
  let doctorName = visit.doctorName;
  if (data.doctorId !== visit.doctorId) {
    const doctor = await findActiveDoctor(data.doctorId);
    if (!doctor) return failure(FIX_FIELDS, { doctorId: "ექიმი ვერ მოიძებნა ან გათიშულია" });
    doctorName = `${doctor.firstName} ${doctor.lastName}`;
  }

  const keptIds = data.items.flatMap((i) => ("visitServiceId" in i ? [i.visitServiceId] : []));
  const newServiceIds = data.items.flatMap((i) => ("serviceId" in i ? [i.serviceId] : []));
  const kept = visit.services.filter((s) => keptIds.includes(s.id));
  if (kept.length !== new Set(keptIds).size) return failure("ვიზიტის სერვისები შეიცვალა — განაახლეთ გვერდი");

  const newServices = await prisma.service.findMany({ where: { id: { in: newServiceIds } } });
  if (newServices.length !== new Set(newServiceIds).size) {
    return failure(FIX_FIELDS, { serviceIds: "ზოგიერთი სერვისი აღარ არსებობს — განაახლეთ გვერდი" });
  }
  const allServiceIds = [...kept.map((s) => s.serviceId), ...newServiceIds].filter((id) => id !== null);
  if (new Set(allServiceIds).size !== allServiceIds.length) return failure(FIX_FIELDS, { serviceIds: "სერვისი ორჯერაა არჩეული" });

  const total = [...kept.map((s) => s.price), ...newServices.map((s) => s.price)].reduce(
    (sum, p) => sum.plus(p),
    new Prisma.Decimal(0),
  );
  if (visit.paidAmount.gt(total)) {
    return failure(FIX_FIELDS, {
      serviceIds: `ახალი ჯამი (${formatGel(total.toFixed(2))}) გადახდილ თანხაზე (${formatGel(visit.paidAmount.toFixed(2))}) ნაკლებია`,
    });
  }

  const byId = new Map(newServices.map((s) => [s.id, s]));
  await prisma.$transaction([
    prisma.visitService.deleteMany({ where: { visitId: visit.id, id: { notIn: keptIds } } }),
    prisma.visitService.createMany({
      data: newServiceIds.map((id) => ({ visitId: visit.id, ...snapshot(byId.get(id)!) })),
    }),
    prisma.visit.update({
      where: { id: visit.id },
      data: {
        doctorId: data.doctorId,
        doctorName,
        visitAt,
        visitType: data.visitType,
        totalAmount: total,
        comment: data.comment,
        updatedById: Number(me.id),
      },
    }),
  ]);

  return { ok: true, message: "ვიზიტი შეიცვალა", visitId: visit.id };
}

/** ვიზიტის გაუქმება (მიზეზით). ჩანაწერი რჩება ისტორიაში, ჯამებში აღარ ითვლება. */
export async function cancelVisit(input: VisitCancelInput): Promise<ActionResult> {
  const me = await requireAnyRole(...PATIENT_ROLES);
  const parsed = visitCancelSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { count } = await prisma.visit.updateMany({
    where: { id: parsed.data.visitId, status: "active" },
    data: { status: "cancelled", cancelReason: parsed.data.reason, cancelledById: Number(me.id), cancelledAt: new Date() },
  });
  if (count === 0) return failure(NOT_EDITABLE);
  return success("ვიზიტი გაუქმდა");
}

/** მოგვიანებით შემოტანილი თანხა. დავალიანებაზე მეტი ვერ იქნება. */
export async function addVisitPayment(input: VisitPaymentInput): Promise<ActionResult> {
  const me = await requireAnyRole(...PATIENT_ROLES);
  const parsed = visitPaymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const amount = new Prisma.Decimal(parsed.data.amount);

  const visit = await prisma.visit.findFirst({ where: { id: parsed.data.visitId, status: "active" } });
  if (!visit) return failure(NOT_EDITABLE);
  const debt = visit.totalAmount.minus(visit.paidAmount);
  if (amount.gt(debt)) return failure(FIX_FIELDS, { amount: `თანხა დავალიანებას (${formatGel(debt.toFixed(2))}) აღემატება` });

  try {
    await prisma.$transaction(async (tx) => {
      // ოპტიმისტური შემოწმება: ამასობაში სხვამ რომ გადაიხადოს, ორჯერ არ ჩაიწეროს
      const { count } = await tx.visit.updateMany({
        where: { id: visit.id, status: "active", paidAmount: visit.paidAmount },
        data: { paidAmount: visit.paidAmount.plus(amount) },
      });
      if (count === 0) throw new Error("STALE");
      await tx.visitPayment.create({
        data: { visitId: visit.id, amount, method: parsed.data.method, createdById: Number(me.id) },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STALE") return failure("ვიზიტი ამასობაში შეიცვალა — განაახლეთ გვერდი");
    throw error;
  }
  return success(`გადახდა დაემატა: ${formatGel(amount.toFixed(2))}`);
}
