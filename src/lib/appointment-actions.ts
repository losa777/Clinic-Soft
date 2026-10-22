"use server";

import { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { loadDaySlots } from "@/lib/appointment-records";
import {
  type AppointmentCancelInput,
  appointmentCancelSchema,
  type AppointmentInput,
  appointmentSchema,
  BOOKING_HORIZON_DAYS,
  type BookingPatient,
  type BookingPatientValues,
  bookingPatientSchema,
  type RescheduleInput,
  rescheduleSchema,
  type SlotsQuery,
  type SlotsResult,
  slotsQuerySchema,
  STATUS_TRANSITIONS,
  type StatusChangeInput,
  statusChangeSchema,
  appointmentStatusLabel,
} from "@/lib/appointment-schema";
import { addDays, formatDate, formatTime, tbilisiParts, tbilisiToday } from "@/lib/appointment-slots";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { type PatientSearchResult, searchPatients } from "@/lib/patient-records";
import { can } from "@/lib/permissions";
import { type NewPatientPolicyInput, newPatientPolicySchema } from "@/modules/finance/schema";
import { FinanceError } from "@/modules/finance/server/errors";
import { createPatientPolicy } from "@/modules/finance/server/insurance";

/**
 * ჯავშნების Server Actions. ყველა მოქმედება სერვერზე ამოწმებს უფლებას (appointments.book — დაჯავშნა,
 * appointments.manage — გადატანა/სტატუსი/გაუქმება) და input-ს (zod);
 * ბაზასთან მუშაობა Prisma-თი ან პარამეტრიზებული $queryRaw-ით ხდება (SQL injection-ისგან დაცულია).
 */

export type BookingSaveResult = { ok: true; message: string; appointmentId: number } | ActionFailure;
export type PatientRegisterResult = { ok: true; message: string; patient: BookingPatient } | ActionFailure;

const NOT_FOUND = "ჯავშანი ვერ მოიძებნა — განაახლეთ გვერდი";
const DOCTOR_UNAVAILABLE = "ექიმი ვერ მოიძებნა ან გათიშულია";

/** ტრანზაქციიდან გამოსატანი, მომხმარებლისთვის განკუთვნილი შეცდომა. */
class BookingError extends Error {}

function checkBookingDate(date: string): string | null {
  const today = tbilisiToday();
  if (date < today) return "წარსული თარიღის დაჯავშნა შეუძლებელია";
  if (date > addDays(today, BOOKING_HORIZON_DAYS)) return `ჯავშანი შეიძლება მაქსიმუმ ${BOOKING_HORIZON_DAYS} დღით წინ`;
  return null;
}

/** პაციენტის ძებნა პირადი ნომრით, გვარით/სახელით ან ტელეფონით (მაქს. 20 შედეგი). */
export async function searchAppointmentPatients(query: string): Promise<PatientSearchResult> {
  await requirePermission("appointments.book");
  if (typeof query !== "string") return { status: "invalid", error: "ძებნის ტექსტი არასწორია" };
  return searchPatients(query.slice(0, 100), { byPhone: true });
}

/**
 * ჯავშნისას ახალი პაციენტის რეგისტრაცია (პაციენტის სრული ფორმის წესებით, ტელეფონი სავალდებულოა).
 * policy — არასავალდებულო პოლისი: იქმნება პაციენტთან ერთად, ერთ ტრანზაქციაში.
 */
export async function registerAppointmentPatient(
  values: BookingPatientValues,
  policy: NewPatientPolicyInput | null = null,
): Promise<PatientRegisterResult> {
  const me = await requirePermission("appointments.book");
  const parsed = bookingPatientSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error);
  const parsedPolicy = policy === null ? null : newPatientPolicySchema.safeParse(policy);
  if (parsedPolicy && !parsedPolicy.success) return invalid(parsedPolicy.error);
  if (parsedPolicy && !can(me, "invoices.create") && !can(me, "insurance.manage")) return failure("პოლისის დამატების უფლება არ გაქვთ");
  const userId = Number(me.id);

  try {
    const p = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          ...parsed.data,
          birthDate: new Date(`${parsed.data.birthDate}T00:00:00Z`),
          createdById: userId,
          updatedById: userId,
        },
        select: { id: true, personalId: true, firstName: true, lastName: true, phone: true },
      });
      if (parsedPolicy) await createPatientPolicy(tx, patient.id, parsedPolicy.data, userId);
      return patient;
    });
    return {
      ok: true,
      message: parsedPolicy ? "პაციენტი დარეგისტრირდა, პოლისი დაემატა" : "პაციენტი დარეგისტრირდა",
      patient: { ...p, birthDate: formatDate(parsed.data.birthDate) },
    };
  } catch (error) {
    if (error instanceof FinanceError) return failure(error.message, error.fieldErrors);
    if (isUniqueViolation(error)) {
      return failure("პაციენტი უკვე არსებობს", { personalId: "ამ პირადი ნომრით პაციენტი უკვე არსებობს — მოძებნეთ" });
    }
    throw error;
  }
}

/** ექიმის თავისუფალი სლოტები არჩეულ დღეს (დაკავებული და გასული — გათიშულად). */
export async function getDoctorSlots(query: SlotsQuery): Promise<SlotsResult> {
  await requirePermission("appointments.book");
  const parsed = slotsQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const dateError = checkBookingDate(parsed.data.date);
  if (dateError) return { ok: false, error: dateError };

  const day = await loadDaySlots(prisma, parsed.data);
  if (!day) return { ok: false, error: DOCTOR_UNAVAILABLE };
  return { ok: true, slots: day.slots, duration: day.doctor.duration, dayOff: day.dayOff };
}

/**
 * ექიმისა და პაციენტის ჩაკეტვა ტრანზაქციის ბოლომდე (SELECT ... FOR UPDATE). ერთი და იმავე ექიმის ან პაციენტის
 * ჯავშნები ასე რიგრიგობით მოწმდება — ორი რეგისტრატორი ერთდროულად ერთ სლოტს ვერ დაჯავშნის.
 * რიგი მუდმივია (ჯერ ექიმი, მერე პაციენტი), რომ deadlock არ მოხდეს.
 */
async function lockDoctorAndPatient(tx: Prisma.TransactionClient, doctorId: number, patientId: number) {
  const doctor = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM doctors WHERE id = ${doctorId} FOR UPDATE`;
  if (!doctor.length) throw new BookingError(DOCTOR_UNAVAILABLE);
  const patient = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM patients WHERE id = ${patientId} FOR UPDATE`;
  if (!patient.length) throw new BookingError("პაციენტი ვერ მოიძებნა");
}

/**
 * არჩეული დროის შემოწმება ჩაკეტვის შემდეგ: სლოტი სერვერზე თავიდან ითვლება გრაფიკიდან (კლიენტს არ ვენდობით).
 * აბრუნებს დასრულების დროს.
 */
async function checkSlot(
  tx: Prisma.TransactionClient,
  { doctorId, patientId, start, excludeAppointmentId }: { doctorId: number; patientId: number; start: Date; excludeAppointmentId?: number },
): Promise<Date> {
  const { date } = tbilisiParts(start);
  const dateError = checkBookingDate(date);
  if (dateError) throw new BookingError(dateError);

  const day = await loadDaySlots(tx, { doctorId, date, patientId, excludeAppointmentId });
  if (!day) throw new BookingError(DOCTOR_UNAVAILABLE);
  const slot = day.slots.find((s) => s.start === start.toISOString());
  if (!slot) throw new BookingError("არჩეული დრო ექიმის გრაფიკს არ ემთხვევა — განაახლეთ სლოტები");
  if (slot.state === "past") throw new BookingError("არჩეული დრო უკვე გასულია");
  if (slot.state === "busy") throw new BookingError(`${slot.time} უკვე დაკავებულია — აირჩიეთ სხვა დრო`);

  const end = new Date(start.getTime() + day.doctor.duration * 60_000);
  if (slot.state === "patient") {
    const other = await tx.appointment.findFirst({
      where: {
        patientId,
        status: { not: "cancelled" },
        source: "booking",
        startTime: { lt: end },
        endTime: { gt: start },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: {
        startTime: true,
        endTime: true,
        doctor: { select: { user: { select: { firstName: true, lastName: true } }, specialty: { select: { name: true } } } },
      },
    });
    const who = other ? ` — ${other.doctor.user.firstName} ${other.doctor.user.lastName} (${other.doctor.specialty.name}), ${formatTime(other.startTime)}–${formatTime(other.endTime)}` : "";
    throw new BookingError(`პაციენტს ამ დროს უკვე აქვს ჯავშანი სხვა ექიმთან${who}`);
  }
  return end;
}

/** READ COMMITTED: ჩაკეტვის შემდეგ ყოველი წაკითხვა ბოლო დადასტურებულ მონაცემებს ხედავს. */
const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 };

async function runBooking<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T | ActionFailure> {
  try {
    return await prisma.$transaction(fn, TX_OPTIONS);
  } catch (error) {
    if (error instanceof BookingError) return failure(error.message);
    throw error;
  }
}

/** ჯავშნის შექმნა. */
export async function createAppointment(input: AppointmentInput): Promise<BookingSaveResult> {
  const me = await requirePermission("appointments.book");
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { patientId, doctorId, comment } = parsed.data;
  const start = new Date(parsed.data.start);

  const result = await runBooking(async (tx) => {
    await lockDoctorAndPatient(tx, doctorId, patientId);
    const end = await checkSlot(tx, { doctorId, patientId, start });
    return tx.appointment.create({
      data: { patientId, doctorId, startTime: start, endTime: end, comment, createdById: Number(me.id) },
      select: { id: true },
    });
  });
  if ("ok" in result) return result;

  const { date } = tbilisiParts(start);
  return { ok: true, message: `ვიზიტი დაიჯავშნა: ${formatDate(date)}, ${formatTime(start)}`, appointmentId: result.id };
}

/** ჯავშნის გადატანა სხვა დროზე (იმავე ექიმთან). მხოლოდ „დაჯავშნილი“ სტატუსის ჯავშანი. */
export async function rescheduleAppointment(input: RescheduleInput): Promise<ActionResult> {
  const me = await requirePermission("appointments.manage");
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const start = new Date(parsed.data.start);

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    select: { id: true, doctorId: true, patientId: true, status: true },
  });
  if (!appointment) return failure(NOT_FOUND);
  if (appointment.status !== "booked") return failure("გადატანა შეიძლება მხოლოდ „დაჯავშნილი“ ჯავშნის");

  const result = await runBooking(async (tx) => {
    await lockDoctorAndPatient(tx, appointment.doctorId, appointment.patientId);
    const end = await checkSlot(tx, { ...appointment, start, excludeAppointmentId: appointment.id });
    // სტატუსი ამასობაში შეიძლება შეცვლილიყო
    const { count } = await tx.appointment.updateMany({
      where: { id: appointment.id, status: "booked" },
      data: { startTime: start, endTime: end, updatedById: Number(me.id) },
    });
    if (count === 0) throw new BookingError("ჯავშანი ამასობაში შეიცვალა — განაახლეთ გვერდი");
    return count;
  });
  if (typeof result !== "number") return result;

  return success(`ჯავშანი გადაიტანეს: ${formatDate(tbilisiParts(start).date)}, ${formatTime(start)}`);
}

/** სტატუსის შეცვლა (მობრძანდა / დასრულებული / არ გამოცხადდა / დაჯავშნილი) — დასაშვები გადასვლებით. */
export async function changeAppointmentStatus(input: StatusChangeInput): Promise<ActionResult> {
  const me = await requirePermission("appointments.manage");
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { appointmentId, status } = parsed.data;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { status: true, startTime: true },
  });
  if (!appointment) return failure(NOT_FOUND);
  if (!STATUS_TRANSITIONS[appointment.status].includes(status)) {
    return failure(`„${appointmentStatusLabel(appointment.status)}“ → „${appointmentStatusLabel(status)}“ — ეს ცვლილება დაუშვებელია`);
  }
  if (status === "no_show" && appointment.startTime.getTime() > Date.now()) {
    return failure("„არ გამოცხადდა“ შეიძლება მხოლოდ ვიზიტის დროის შემდეგ");
  }
  if (status === "arrived" && tbilisiParts(appointment.startTime).date > tbilisiToday()) {
    return failure("მომავალი დღის ჯავშანზე ამ სტატუსს ვერ დააყენებთ");
  }

  // ოპტიმისტური შემოწმება: სხვამ ამასობაში თუ შეცვალა, ჩვენი ცვლილება არ ჩაიწერება
  const { count } = await prisma.appointment.updateMany({
    where: { id: appointmentId, status: appointment.status },
    // მოსვლის დრო — ექიმის მომლოდინეთა რიგისთვის
    data: { status, updatedById: Number(me.id), arrivedAt: status === "arrived" ? new Date() : null },
  });
  if (count === 0) return failure("ჯავშანი ამასობაში შეიცვალა — განაახლეთ გვერდი");
  return success(`სტატუსი: ${appointmentStatusLabel(status)}`);
}

/** ჯავშნის გაუქმება მიზეზით. ჩანაწერი რჩება, სლოტი თავისუფლდება. დასრულებული ვიზიტი არ უქმდება. */
export async function cancelAppointment(input: AppointmentCancelInput): Promise<ActionResult> {
  const me = await requirePermission("appointments.manage");
  const parsed = appointmentCancelSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { count } = await prisma.appointment.updateMany({
    where: { id: parsed.data.appointmentId, status: { notIn: ["cancelled", "completed", "in_progress"] } },
    data: {
      status: "cancelled",
      cancelReason: parsed.data.reason,
      cancelledById: Number(me.id),
      cancelledAt: new Date(),
      updatedById: Number(me.id),
    },
  });
  if (count === 0) return failure("ჯავშანი ვერ მოიძებნა, უკვე გაუქმებულია, დასრულებულია ან პაციენტი მიღებაზეა");
  return success("ჯავშანი გაუქმდა");
}
