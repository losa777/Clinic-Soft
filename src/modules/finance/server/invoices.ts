import "server-only";
import { type AppointmentStatus, Prisma } from "@/generated/prisma/client";
import { formatDate, formatTime, tbilisiParts, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { userWithRole } from "@/lib/user-roles";
import { notifyArrival } from "@/lib/notifications";
import { calcLine, fromTetri, invoiceDebt, invoiceStatus, type LineAmounts, netPaid, sumLines, toTetri } from "@/modules/finance/calc";
import type { z } from "zod";
import type { invoiceSchema } from "@/modules/finance/schema";
import type { InvoiceDetail, InvoiceFormData, InvoiceListRow, InvoiceStatus, PaymentMethod } from "@/modules/finance/types";
import { currentYear, type Db, dayRange, dec, formatDateTime, fullName, int, periodRange, tetri } from "./db";
import { FinanceError } from "./errors";
import { nextNumber } from "./numbering";
import { patientDebts } from "./debts";
import { loadActivePolicy, loadBillableServices, loadCoverage } from "./pricing";

/**
 * ინვოისები: შექმნა (ფასები და დაზღვევა სერვერზე), გაუქმება, წაკითხვა. უფლებას გამომძახებელი ამოწმებს.
 * გადახდილი და ვალი არ ინახება — ითვლება payments-იდან.
 */

type ParsedInvoice = z.output<typeof invoiceSchema>;

const appointmentLabel = (a: { startTime: Date; doctor: { user: { firstName: string; lastName: string } } }) =>
  `${formatDate(tbilisiParts(a.startTime).date)} ${formatTime(a.startTime)} · ${fullName(a.doctor.user)}`;

/** ჯავშნის გაუქმებელი ინვოისი (ერთ ჯავშანზე ერთი). */
async function invoiceOfAppointment(db: Db, appointmentId: number) {
  return db.invoice.findFirst({ where: { appointmentId, status: { not: "cancelled" } }, select: { id: true, invoiceNumber: true } });
}

/** ინვოისის ფორმა: პაციენტი, ჯავშანი (კონსულტაციის სერვისით), სერვისები, აქტიური პოლისი და დაფარვა. */
export async function loadInvoiceFormData({
  patientId,
  appointmentId,
}: {
  patientId: number | null;
  appointmentId: number | null;
}): Promise<InvoiceFormData | null> {
  const appointment = appointmentId
    ? await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          doctor: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        },
      })
    : null;
  if (appointmentId && !appointment) return null;
  const pid = appointment?.patientId ?? patientId;
  if (!pid) return null;

  const patient = await prisma.patient.findUnique({
    where: { id: pid },
    select: { id: true, firstName: true, lastName: true, personalId: true },
  });
  if (!patient) return null;

  const [services, policy, doctors, debts, existing] = await Promise.all([
    loadBillableServices(prisma),
    loadActivePolicy(prisma, pid),
    prisma.user.findMany({
      where: { isActive: true, ...userWithRole({ code: "doctor" }) },
      select: { id: true, firstName: true, lastName: true, doctorProfile: { select: { id: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    patientDebts(prisma, [pid]),
    appointment ? invoiceOfAppointment(prisma, appointment.id) : Promise.resolve(null),
  ]);
  const coverage = policy ? await loadCoverage(prisma, policy.companyId, services) : new Map();

  const consultation = appointment?.doctor.consultationServiceId;
  return {
    patient: { id: patient.id, name: fullName(patient)!, personalId: patient.personalId, debt: fromTetri(debts.get(pid) ?? 0) },
    appointment: appointment ? { id: appointment.id, label: appointmentLabel(appointment) } : null,
    doctor: appointment ? { id: appointment.doctor.user.id, name: fullName(appointment.doctor.user)! } : null,
    doctors: doctors.map((d) => ({ id: d.id, name: fullName(d)!, queue: d.doctorProfile !== null })),
    services,
    initialServiceIds: consultation && services.some((s) => s.id === consultation) ? [consultation] : [],
    policy,
    coverage: Object.fromEntries(coverage),
    defaultServiceDate: (appointment?.startTime ?? new Date()).toISOString(),
    existingInvoice: existing ? { id: existing.id, number: existing.invoiceNumber } : null,
  };
}

/**
 * ინვოისის შექმნა ტრანზაქციაში: ფასები — ბაზის მიმდინარე (აქტიური სერვისები), დაზღვევა — პაციენტის აქტიური პოლისით
 * (თუ ხელით არ გამორთეს). ხაზებში ყველაფერი ამ მომენტის მნიშვნელობით იწერება — ფასის შემდგომი ცვლილება ინვოისს არ ცვლის.
 * options.queueWalkIn = false — ექიმით, ჯავშნის გარეშე ინვოისი რიგს არ ქმნის (მაგ. ვიზიტის დასრულებისას დამატებითი ინვოისი).
 */
export async function createInvoice(
  tx: Db,
  input: ParsedInvoice,
  userId: number,
  options: { queueWalkIn?: boolean } = {},
): Promise<{ id: number; number: string }> {
  const patient = await tx.patient.findUnique({ where: { id: input.patientId }, select: { id: true } });
  if (!patient) throw new FinanceError("პაციენტი ვერ მოიძებნა");

  let doctorId = input.doctorId;
  let doctorName: string | null = null;
  let appointmentId = input.appointmentId;
  if (input.appointmentId) {
    // ჯავშნის ჩაკეტვა: ერთდროულად ორი ინვოისი ერთ ჯავშანზე არ შეიქმნება
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM appointments WHERE id = ${input.appointmentId} FOR UPDATE`;
    if (!locked.length) throw new FinanceError("ჯავშანი ვერ მოიძებნა");
    const appointment = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
      select: {
        patientId: true,
        status: true,
        doctor: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!appointment || appointment.patientId !== input.patientId) throw new FinanceError("ჯავშანი სხვა პაციენტისაა");
    if (appointment.status === "cancelled") throw new FinanceError("ჯავშანი გაუქმებულია");
    const existing = await invoiceOfAppointment(tx, input.appointmentId);
    if (existing) throw new FinanceError(`ამ ჯავშანზე ინვოისი უკვე არსებობს: ${existing.invoiceNumber}`);
    // ჯავშნის ექიმი (შეიძლება უკვე გათიშული იყოს — სახელი მაინც იწერება)
    doctorId = appointment.doctor.user.id;
    doctorName = fullName(appointment.doctor.user);
    // ინვოისი ნიშნავს, რომ პაციენტი მოვიდა — ექიმის მომლოდინეთა რიგში ჩადგება
    if (appointment.status === "booked") {
      await tx.appointment.update({
        where: { id: input.appointmentId },
        data: { status: "arrived", arrivedAt: new Date(), updatedById: userId },
      });
      await notifyArrival(tx, input.appointmentId);
    }
  } else if (doctorId) {
    const doctor = await tx.user.findFirst({ where: { id: doctorId, isActive: true, ...userWithRole({ code: "doctor" }) } });
    if (!doctor) throw new FinanceError("ექიმი ვერ მოიძებნა ან გათიშულია", { doctorId: "ექიმი ვერ მოიძებნა" });
    doctorName = fullName(doctor);
    if (options.queueWalkIn !== false) appointmentId = await queueWalkIn(tx, input.patientId, doctorId, userId);
  }

  const ids = input.items.map((i) => i.serviceId);
  const services = await tx.service.findMany({ where: { id: { in: ids }, isActive: true } });
  if (services.length !== ids.length) {
    throw new FinanceError("ზოგიერთი სერვისი აღარ არსებობს ან გათიშულია — განაახლეთ გვერდი", { items: "განაახლეთ სერვისები" });
  }
  const byId = new Map(services.map((s) => [s.id, s]));

  const activePolicy = await loadActivePolicy(tx, input.patientId);
  const policy = input.disableInsurance ? null : activePolicy;
  const coverage = policy ? await loadCoverage(tx, policy.companyId, services) : new Map();

  const lines = input.items.map((item) => {
    const s = byId.get(item.serviceId)!;
    const amounts: LineAmounts = calcLine({
      unitPrice: toTetri(s.price.toFixed(2)),
      quantity: item.quantity,
      discountPercent: item.discountPercent,
      coverage: coverage.get(s.id) ?? null,
    });
    return { item, service: s, amounts };
  });
  const totals = sumLines(lines.map((l) => l.amounts));

  const number = await nextNumber(tx, "INV", currentYear());
  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: number,
      patientId: input.patientId,
      appointmentId,
      doctorId,
      doctorName,
      serviceDate: new Date(input.serviceDate),
      visitType: input.visitType,
      status: invoiceStatus(totals.patient, 0),
      totalAmount: dec(totals.total),
      discountAmount: dec(totals.discount),
      insuranceAmount: dec(totals.insurance),
      patientAmount: dec(totals.patient),
      patientInsuranceId: policy?.id ?? null,
      insuranceCompanyId: policy?.companyId ?? null,
      policyNumber: policy?.policyNumber ?? null,
      // გამორთვის მიზეზი ინახება მხოლოდ თუ პოლისი ნამდვილად ჰქონდა
      insuranceDisabledReason: input.disableInsurance && activePolicy ? input.disableInsuranceReason : null,
      comment: input.comment,
      createdById: userId,
      createdAt: new Date(),
      items: {
        create: lines.map(({ item, service, amounts }) => ({
          serviceId: service.id,
          serviceCode: service.code,
          serviceName: service.name,
          quantity: item.quantity,
          unitPrice: service.price,
          discountPercent: item.discountPercent,
          discountAmount: dec(amounts.discount),
          totalAmount: dec(amounts.total),
          insuranceAmount: dec(amounts.insurance),
          patientAmount: dec(amounts.patient),
        })),
      },
    },
    select: { id: true },
  });
  return { id: invoice.id, number };
}

/** დღევანდელი თბილისის დღის საზღვრები. */
const currentDayRange = () => dayRange(tbilisiToday());

/**
 * ცოცხალი რიგი: ინვოისი ექიმით, ჯავშნის გარეშე → ექიმის რიგში „მობრძანდა“ (source = walk_in, სლოტს არ იკავებს).
 * პაციენტი ამ ექიმთან დღეს უკვე თუ ელოდება/მიღებაზეა — იგივე ჩანაწერი (მეორე რიგი არ იქმნება).
 * ექიმს პროფილი (doctors) თუ არ აქვს, რიგი არ იქმნება (null) — ინვოისი ჩვეულებრივად.
 */
async function queueWalkIn(tx: Db, patientId: number, doctorUserId: number, userId: number): Promise<number | null> {
  const profile = await tx.doctor.findUnique({ where: { userId: doctorUserId }, select: { id: true, visitDuration: true } });
  if (!profile) return null;
  // ექიმის ჩაკეტვა: ერთდროულად ორი ინვოისი ერთ პაციენტზე ორ რიგს არ შექმნის
  await tx.$queryRaw`SELECT id FROM doctors WHERE id = ${profile.id} FOR UPDATE`;
  const now = new Date();
  const today = currentDayRange();
  const waiting = await tx.appointment.findFirst({
    where: { patientId, doctorId: profile.id, status: { in: ["arrived", "in_progress"] }, startTime: { gte: today.from, lt: today.to } },
    select: { id: true },
  });
  if (waiting) return waiting.id;
  const appointment = await tx.appointment.create({
    data: {
      patientId,
      doctorId: profile.id,
      startTime: now,
      endTime: new Date(now.getTime() + profile.visitDuration * 60_000),
      status: "arrived",
      source: "walk_in",
      arrivedAt: now,
      comment: "ცოცხალი რიგი (ინვოისიდან)",
      createdById: userId,
    },
    select: { id: true },
  });
  await notifyArrival(tx, appointment.id);
  return appointment.id;
}

/** ინვოისის ჩაკეტვა ტრანზაქციის ბოლომდე და მისი თანხები/გადახდები (გადახდისა და გაუქმებისთვის). */
export async function lockInvoice(tx: Db, invoiceId: number) {
  const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
  if (!locked.length) throw new FinanceError("ინვოისი ვერ მოიძებნა");
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { id: true, status: true, patientAmount: true, invoiceNumber: true },
  });
  const payments = await tx.payment.groupBy({ by: ["type", "method"], where: { invoiceId }, _sum: { amount: true } });
  const sum = (type: "payment" | "refund", method?: PaymentMethod) =>
    payments.filter((p) => p.type === type && (!method || p.method === method)).reduce((s, p) => s + tetri(p._sum.amount), 0);
  const paid = sum("payment") - sum("refund");
  return {
    invoice,
    patientAmount: tetri(invoice.patientAmount),
    paid,
    paidByMethod: { cash: sum("payment", "cash") - sum("refund", "cash"), card: sum("payment", "card") - sum("refund", "card") },
  };
}

/** სტატუსის განახლება გადახდის/დაბრუნების შემდეგ (იმავე ტრანზაქციაში). */
export async function refreshInvoiceStatus(tx: Db, invoiceId: number, patientAmount: number, paid: number) {
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: invoiceStatus(patientAmount, paid) } });
}

/** ექიმმა მიღება დაიწყო ან დაასრულა — მომსახურება გაწეულია. */
const isRendered = (status: AppointmentStatus | undefined) => status === "in_progress" || status === "completed";

/**
 * ინვოისის გაუქმება: მხოლოდ თუ გადახდილი (წმინდა) 0-ია — სხვაგვარად ჯერ დაბრუნება.
 * გაწეულ მომსახურებაზე (ექიმმა მიღება დაიწყო/დაასრულა) — მხოლოდ invoices.cancel_rendered უფლებით (cancelRendered).
 */
export async function cancelInvoice(
  tx: Db,
  invoiceId: number,
  reason: string,
  userId: number,
  options: { cancelRendered?: boolean } = {},
) {
  const { invoice, paid } = await lockInvoice(tx, invoiceId);
  if (invoice.status === "cancelled") throw new FinanceError("ინვოისი უკვე გაუქმებულია");
  if (paid > 0) throw new FinanceError(`ინვოისზე გადახდილია ${fromTetri(paid)} ₾ — ჯერ დააბრუნეთ თანხა, მერე გააუქმეთ`);
  if (!options.cancelRendered) {
    const { appointment } = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { appointment: { select: { status: true } } } });
    if (isRendered(appointment?.status)) throw new FinanceError("ექიმმა მიღება უკვე დაიწყო — გაუქმება მხოლოდ ადმინისტრატორს შეუძლია");
  }
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { status: "cancelled", cancelReason: reason, cancelledById: userId, cancelledAt: new Date() },
  });
  await releaseQueue(tx, invoiceId, userId);
  return invoice.invoiceNumber;
}

/**
 * გაუქმებული ინვოისის ჯავშანი ექიმის რიგიდან გამოდის, თუ ექიმს მიღება ჯერ არ დაუწყია („მობრძანდა“) და ჯავშანზე
 * სხვა მოქმედი ინვოისი აღარ არის: ცოცხალი რიგი (walk_in) უქმდება, ჩვეულებრივი ჯავშანი „დაჯავშნილს“ უბრუნდება.
 */
async function releaseQueue(tx: Db, invoiceId: number, userId: number) {
  const { appointmentId } = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { appointmentId: true } });
  if (!appointmentId) return;
  if (await invoiceOfAppointment(tx, appointmentId)) return;
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, source: true } });
  if (appointment?.status !== "arrived") return;
  // status: arrived — ექიმმა ამასობაში თუ მიღება დაიწყო, ჯავშანს არ ვეხებით
  await tx.appointment.updateMany({
    where: { id: appointmentId, status: "arrived" },
    data:
      appointment.source === "walk_in"
        ? { status: "cancelled", cancelReason: "ინვოისი გაუქმდა", cancelledById: userId, cancelledAt: new Date(), updatedById: userId }
        : { status: "booked", arrivedAt: null, updatedById: userId },
  });
}

export async function loadInvoiceDetail(id: number): Promise<InvoiceDetail | null> {
  const i = await prisma.invoice.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, personalId: true, phone: true } },
      appointment: { include: { doctor: { include: { user: { select: { firstName: true, lastName: true } } } } } },
      insuranceCompany: { select: { name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      cancelledBy: { select: { firstName: true, lastName: true } },
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { id: "asc" }, include: { createdBy: { select: { firstName: true, lastName: true } }, bank: { select: { name: true } } } },
    },
  });
  if (!i) return null;

  const records = i.payments.map((p) => ({ type: p.type, method: p.method, amount: tetri(p.amount) }));
  const paid = netPaid(records);
  const byMethod = (m: PaymentMethod) => netPaid(records.filter((r) => r.method === m));
  const patientAmount = tetri(i.patientAmount);

  return {
    id: i.id,
    number: i.invoiceNumber,
    status: i.status,
    createdAt: formatDateTime(i.createdAt),
    createdBy: fullName(i.createdBy),
    serviceDate: formatDateTime(i.serviceDate),
    visitType: i.visitType,
    doctorName: i.doctorName,
    patient: { id: i.patient.id, name: fullName(i.patient)!, personalId: i.patient.personalId, phone: i.patient.phone },
    appointment: i.appointment
      ? { id: i.appointment.id, label: appointmentLabel(i.appointment), rendered: isRendered(i.appointment.status) }
      : null,
    insurance: i.insuranceCompany ? { companyName: i.insuranceCompany.name, policyNumber: i.policyNumber } : null,
    insuranceDisabledReason: i.insuranceDisabledReason,
    items: i.items.map((it) => ({
      id: it.id,
      code: it.serviceCode,
      name: it.serviceName,
      quantity: it.quantity,
      unitPrice: it.unitPrice.toFixed(2),
      discountPercent: it.discountPercent.toFixed(2),
      discount: it.discountAmount.toFixed(2),
      total: it.totalAmount.toFixed(2),
      insurance: it.insuranceAmount.toFixed(2),
      patient: it.patientAmount.toFixed(2),
    })),
    totals: {
      total: i.totalAmount.toFixed(2),
      discount: i.discountAmount.toFixed(2),
      insurance: i.insuranceAmount.toFixed(2),
      patient: i.patientAmount.toFixed(2),
      paid: fromTetri(paid),
      debt: fromTetri(i.status === "cancelled" ? 0 : invoiceDebt(patientAmount, paid)),
    },
    paidByMethod: { cash: fromTetri(byMethod("cash")), card: fromTetri(byMethod("card")) },
    payments: i.payments.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      type: p.type,
      method: p.method,
      amount: p.amount.toFixed(2),
      receivedAmount: p.receivedAmount?.toFixed(2) ?? null,
      changeAmount: p.changeAmount?.toFixed(2) ?? null,
      cardReference: p.cardReference,
      bank: p.bank?.name ?? null,
      reason: p.reason,
      createdAt: formatDateTime(p.createdAt),
      createdBy: fullName(p.createdBy),
    })),
    comment: i.comment,
    cancelled:
      i.status === "cancelled"
        ? { reason: i.cancelReason ?? "", by: fullName(i.cancelledBy), at: i.cancelledAt ? formatDateTime(i.cancelledAt) : "" }
        : null,
  };
}

export const INVOICES_PAGE_SIZE = 25;

export type InvoiceFilter = {
  from: string;
  to: string;
  status: InvoiceStatus | null;
  /** პირადი ნომერი ან ინვოისის ნომერი (ზუსტი) */
  query: string;
  page: number;
};

/**
 * ინვოისების სია: პერიოდი (created_at, ინდექსით), სტატუსი, ძებნა ნომრით. გადახდილი — ქვემოთხოვნით payments(invoice_id)
 * ინდექსით, მხოლოდ გვერდის ჩანაწერებზე.
 */
export async function listInvoices(f: InvoiceFilter): Promise<{ rows: InvoiceListRow[]; total: number; page: number; pageCount: number }> {
  const range = periodRange(f.from, f.to);
  const q = f.query.trim();
  const where: Prisma.InvoiceWhereInput = {
    createdAt: { gte: range.from, lt: range.to },
    ...(f.status ? { status: f.status } : {}),
    ...(q
      ? /^\d{11}$/.test(q)
        ? { patient: { personalId: q } }
        : { invoiceNumber: q.toUpperCase() }
      : {}),
  };
  const total = await prisma.invoice.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / INVOICES_PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page), pageCount);
  const invoices = await prisma.invoice.findMany({
    where,
    include: { patient: { select: { id: true, firstName: true, lastName: true, personalId: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * INVOICES_PAGE_SIZE,
    take: INVOICES_PAGE_SIZE,
  });
  const paid = await paidByInvoice(invoices.map((i) => i.id));
  return {
    total,
    page,
    pageCount,
    rows: invoices.map((i) => toListRow(i, paid.get(i.id) ?? 0)),
  };
}

/** პაციენტის ინვოისები (ბოლო 100) — პაციენტის ბარათისთვის. */
export async function listPatientInvoices(patientId: number): Promise<InvoiceListRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: { patientId },
    include: { patient: { select: { id: true, firstName: true, lastName: true, personalId: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const paid = await paidByInvoice(invoices.map((i) => i.id));
  return invoices.map((i) => toListRow(i, paid.get(i.id) ?? 0));
}

function toListRow(
  i: {
    id: number;
    invoiceNumber: string;
    createdAt: Date;
    status: InvoiceStatus;
    totalAmount: Prisma.Decimal;
    insuranceAmount: Prisma.Decimal;
    patientAmount: Prisma.Decimal;
    patient: { id: number; firstName: string; lastName: string; personalId: string };
  },
  paid: number,
): InvoiceListRow {
  return {
    id: i.id,
    number: i.invoiceNumber,
    createdAt: formatDateTime(i.createdAt),
    patient: { id: i.patient.id, name: fullName(i.patient)!, personalId: i.patient.personalId },
    status: i.status,
    total: i.totalAmount.toFixed(2),
    insurance: i.insuranceAmount.toFixed(2),
    patientAmount: i.patientAmount.toFixed(2),
    paid: fromTetri(paid),
    debt: fromTetri(i.status === "cancelled" ? 0 : invoiceDebt(tetri(i.patientAmount), paid)),
  };
}

/** წმინდა გადახდილი ინვოისების მიხედვით (SQL-ში აგრეგაციით). */
async function paidByInvoice(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<{ invoice_id: number; paid: unknown }[]>`
    SELECT invoice_id, SUM(CASE WHEN type = 'payment' THEN amount ELSE -amount END) AS paid
    FROM payments WHERE invoice_id IN (${Prisma.join(ids)}) GROUP BY invoice_id
  `;
  return new Map(rows.map((r) => [int(r.invoice_id), tetri(r.paid)]));
}

/** ჯავშნების ინვოისები (დღის ჯავშნების სიისთვის). */
export async function invoicesOfAppointments(appointmentIds: number[]): Promise<Map<number, { id: number; number: string }>> {
  if (!appointmentIds.length) return new Map();
  const invoices = await prisma.invoice.findMany({
    where: { appointmentId: { in: appointmentIds }, status: { not: "cancelled" } },
    select: { id: true, invoiceNumber: true, appointmentId: true },
  });
  return new Map(invoices.map((i) => [i.appointmentId!, { id: i.id, number: i.invoiceNumber }]));
}
