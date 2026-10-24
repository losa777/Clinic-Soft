import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { userWithRole } from "@/lib/user-roles";
import {
  APPOINTMENTS_PAGE_SIZE,
  type AppointmentRow,
  type BookingDoctor,
  type SpecialtyOption,
} from "@/lib/appointment-schema";
import { addDays, type BusyInterval, buildSlots, formatTime, isoWeekday, type Slot, tbilisiToDate } from "@/lib/appointment-slots";
import { invoicesOfAppointments } from "@/modules/finance/server/invoices";

/**
 * ჯავშნების წაკითხვა სერვერზე (გვერდებისა და Server Actions-ისთვის).
 * აქ როლი არ მოწმდება — გამომძახებელი ამოწმებს (requireRole / requirePermission).
 */

/** prisma ან ტრანზაქციის კლიენტი — სლოტები ტრანზაქციის შიგნითაც მოწმდება. */
type Db = Prisma.TransactionClient;

/** ვიზიტის მაქსიმალური ხანგრძლივობა (doctors.visit_duration-ის CHECK) — დღის დასაწყისამდე დაწყებული ჯავშნის საპოვნელად. */
const MAX_DURATION_MS = 240 * 60_000;

/** TIME სვეტი Prisma-ში 1970-01-01-ის თარიღად მოდის (UTC) → წუთები შუაღამიდან. */
const timeToMinutes = (t: Date) => t.getUTCHours() * 60 + t.getUTCMinutes();

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/** აქტიური ექიმი: პროფილიც და მომხმარებელიც აქტიურია, მომხმარებელს ისევ „ექიმის“ როლი აქვს. */
const ACTIVE_DOCTOR = { isActive: true, user: { isActive: true, ...userWithRole({ code: "doctor" }) } } satisfies Prisma.DoctorWhereInput;

/** სპეციალობები (რომლებსაც აქტიური ექიმი ჰყავს) და აქტიური ექიმები — ჯავშნის ფორმისთვის. */
export async function loadBookingOptions(): Promise<{ specialties: SpecialtyOption[]; doctors: BookingDoctor[] }> {
  const doctors = await prisma.doctor.findMany({
    where: ACTIVE_DOCTOR,
    include: {
      user: { select: { firstName: true, lastName: true } },
      specialty: true,
      schedules: { select: { weekday: true } },
    },
    orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
  });

  const specialties = new Map<number, SpecialtyOption>();
  for (const d of doctors) specialties.set(d.specialty.id, { id: d.specialty.id, name: d.specialty.name });

  return {
    specialties: [...specialties.values()].sort((a, b) => a.name.localeCompare(b.name, "ka")),
    doctors: doctors.map((d) => ({
      id: d.id,
      name: fullName(d.user),
      specialtyId: d.specialtyId,
      specialty: d.specialty.name,
      room: d.room,
      duration: d.visitDuration,
      weekdays: [...new Set(d.schedules.map((s) => s.weekday))].sort(),
    })),
  };
}

/** ჯავშნები, რომლებიც დღეს ეხება (გაუქმებულის გარეშე). where — doctorId ან patientId (ინდექსით: <სვეტი>, start_time). */
async function busyIntervals(db: Db, date: string, where: Prisma.AppointmentWhereInput): Promise<BusyInterval[]> {
  const dayStart = tbilisiToDate(date, 0);
  const dayEnd = tbilisiToDate(addDays(date, 1), 0);
  const rows = await db.appointment.findMany({
    where: {
      ...where,
      status: { not: "cancelled" },
      // ცოცხალი რიგი სლოტს არ იკავებს (ექიმის რიგში დგება, გრაფიკის გარეთ)
      source: "booking",
      startTime: { gte: new Date(dayStart.getTime() - MAX_DURATION_MS), lt: dayEnd },
      endTime: { gt: dayStart },
    },
    select: { startTime: true, endTime: true },
  });
  return rows.map((r) => ({ start: r.startTime, end: r.endTime }));
}

export type DaySlots = { doctor: { id: number; duration: number }; slots: Slot[]; dayOff: boolean };

/**
 * ექიმის დღის სლოტები: გრაფიკი (კვირის დღით) ÷ ვიზიტის ხანგრძლივობა, დაკავებულისა და გასულის აღნიშვნით.
 * null — ექიმი ვერ მოიძებნა ან გათიშულია.
 */
export async function loadDaySlots(
  db: Db,
  {
    doctorId,
    date,
    patientId,
    excludeAppointmentId,
  }: { doctorId: number; date: string; patientId?: number | null; excludeAppointmentId?: number | null },
): Promise<DaySlots | null> {
  const doctor = await db.doctor.findFirst({
    where: { id: doctorId, ...ACTIVE_DOCTOR },
    select: { id: true, visitDuration: true, schedules: { where: { weekday: isoWeekday(date) } } },
  });
  if (!doctor) return null;

  const exclude = excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {};
  const [doctorBusy, patientBusy] = await Promise.all([
    busyIntervals(db, date, { doctorId, ...exclude }),
    patientId ? busyIntervals(db, date, { patientId, ...exclude }) : Promise.resolve([]),
  ]);

  const slots = buildSlots({
    date,
    intervals: doctor.schedules.map((s) => ({ start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime) })),
    duration: doctor.visitDuration,
    doctorBusy,
    patientBusy,
  });
  return { doctor: { id: doctor.id, duration: doctor.visitDuration }, slots, dayOff: doctor.schedules.length === 0 };
}

export type DayAppointments = { rows: AppointmentRow[]; total: number; page: number; pageCount: number };

/** დღის ჯავშნები (ფილტრი: ექიმი), დროის მიხედვით, გვერდებად — მთელი ცხრილი არასოდეს იკითხება. */
export async function loadDayAppointments({
  date,
  doctorId,
  page,
}: {
  date: string;
  doctorId: number | null;
  page: number;
}): Promise<DayAppointments> {
  // ინდექსები: idx_appointments_start (start_time) ან idx_appointments_doctor_start (doctor_id, start_time)
  const where: Prisma.AppointmentWhereInput = {
    startTime: { gte: tbilisiToDate(date, 0), lt: tbilisiToDate(addDays(date, 1), 0) },
    ...(doctorId ? { doctorId } : {}),
  };

  const total = await prisma.appointment.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / APPOINTMENTS_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, personalId: true, phone: true } },
      doctor: {
        select: {
          id: true,
          room: true,
          user: { select: { firstName: true, lastName: true } },
          specialty: { select: { name: true } },
        },
      },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    skip: (current - 1) * APPOINTMENTS_PAGE_SIZE,
    take: APPOINTMENTS_PAGE_SIZE,
  });

  const now = Date.now();
  const invoices = await invoicesOfAppointments(appointments.map((a) => a.id));
  return {
    total,
    page: current,
    pageCount,
    rows: appointments.map((a) => ({
      id: a.id,
      start: formatTime(a.startTime),
      end: formatTime(a.endTime),
      date,
      patient: { id: a.patient.id, name: fullName(a.patient), personalId: a.patient.personalId, phone: a.patient.phone },
      doctor: { id: a.doctor.id, name: fullName(a.doctor.user), specialty: a.doctor.specialty.name, room: a.doctor.room },
      status: a.status,
      comment: a.comment,
      cancelReason: a.cancelReason,
      createdBy: a.createdBy ? fullName(a.createdBy) : null,
      isPast: a.startTime.getTime() <= now,
      source: a.source,
      invoice: invoices.get(a.id) ?? null,
    })),
  };
}

/** ექიმების სია ფილტრისთვის (გათიშულიც — ძველი ჯავშნების სანახავად). */
export async function loadDoctorFilterOptions(): Promise<DoctorFilterOption[]> {
  const doctors = await prisma.doctor.findMany({
    select: { id: true, user: { select: { firstName: true, lastName: true } }, specialty: { select: { name: true } } },
    orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
  });
  return doctors.map((d) => ({ id: d.id, name: fullName(d.user), specialty: d.specialty.name }));
}

export type DoctorFilterOption = { id: number; name: string; specialty: string };
