import "server-only";
import type { AppointmentStatus } from "@/generated/prisma/client";
import type { BookingPatient } from "@/lib/appointment-schema";
import { addDays, formatDate, formatTime, tbilisiParts, tbilisiToDate } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";

/** ექიმის პროფილი (doctors) სესიის მომხმარებლისთვის; null — ექიმის პროფილი არ აქვს. */
export async function loadDoctorProfile(userId: number) {
  return prisma.doctor.findUnique({
    where: { userId },
    select: { id: true, room: true, visitDuration: true, specialty: { select: { name: true } } },
  });
}

/** ექიმის საკუთარი ჯავშანი პაციენტის ბარათის კონტექსტისთვის (სხვისი — null). */
export async function loadOwnAppointment(appointmentId: number, userId: number) {
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, doctor: { userId } },
    select: { id: true, patientId: true, startTime: true, status: true, encounter: { select: { id: true, status: true } } },
  });
  if (!a) return null;
  return {
    patientId: a.patientId,
    context: {
      id: a.id,
      date: tbilisiParts(a.startTime).date,
      start: formatTime(a.startTime),
      status: a.status,
      own: true,
      isPast: a.startTime.getTime() <= Date.now(),
      encounter: a.encounter,
    },
  };
}

export type ScheduleRow = {
  id: number;
  date: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  /** walk_in — ცოცხალი რიგი (ინვოისიდან, ჯავშნის გარეშე) */
  source: "booking" | "walk_in";
  /** მოსვლის დრო ("14:05") — მომლოდინეთა რიგისთვის */
  arrivedAt: string | null;
  arrivedTs: number | null;
  /** პირველადი — ამ ექიმთან დასრულებული ვიზიტი აქამდე არ ჰქონია */
  visitKind: "first" | "repeat";
  comment: string | null;
  patient: { id: number; name: string; personalId: string };
  /** startedAt / completedAt — "10:20"; minutes — მიღების ხანგრძლივობა (დასრულებულზე) */
  encounter: { id: number; status: "draft" | "completed"; startedAt: string; startedTs: number; completedAt: string | null; minutes: number | null } | null;
  /** ვიზიტის დანიშნულებები: მზადაა (კვლევის პასუხი / შესრულებული პროცედურა) და მოლოდინში */
  orders: { ready: number; pending: number };
};

/** ერთ ჯერზე მაქსიმუმ ამდენი ჯავშანი (კვირაც კი ბევრად ნაკლებია) — მთელი ცხრილი არასოდეს იკითხება. */
const MAX_ROWS = 400;

/**
 * ექიმის ჯავშნები [from, from + days) თბილისის დღეებით, დროის მიხედვით. ინდექსი: (doctor_id, start_time).
 * status — ფილტრი (null — ყველა).
 */
export async function loadSchedule({
  doctorId,
  from,
  days,
  status,
}: {
  doctorId: number;
  from: string;
  days: number;
  status: AppointmentStatus | null;
}): Promise<ScheduleRow[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      startTime: { gte: tbilisiToDate(from, 0), lt: tbilisiToDate(addDays(from, days), 0) },
      ...(status ? { status } : {}),
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      source: true,
      arrivedAt: true,
      comment: true,
      patient: { select: { id: true, firstName: true, lastName: true, personalId: true } },
      encounter: { select: { id: true, status: true, startedAt: true, completedAt: true } },
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
  });

  // დანიშნულებები ვიზიტებზე — ერთი აგრეგაციული მოთხოვნა (encounter_id, status)
  const encounterIds = appointments.flatMap((a) => (a.encounter ? [a.encounter.id] : []));
  const orderCounts = encounterIds.length
    ? await prisma.medicalOrder.groupBy({ by: ["encounterId", "status"], where: { encounterId: { in: encounterIds }, status: { not: "cancelled" } }, _count: true })
    : [];
  const ordersOf = (encounterId: number | undefined) => {
    const out = { ready: 0, pending: 0 };
    for (const c of orderCounts) {
      if (c.encounterId !== encounterId) continue;
      if (c.status === "ready" || c.status === "done") out.ready += c._count;
      else out.pending += c._count;
    }
    return out;
  };

  // პირველადი/განმეორებითი: პაციენტის ყველაზე ადრეული დასრულებული ვიზიტი ამ ექიმთან (ერთი აგრეგაციული მოთხოვნა)
  const patientIds = [...new Set(appointments.map((a) => a.patient.id))];
  const firstVisits = patientIds.length
    ? await prisma.appointment.groupBy({
        by: ["patientId"],
        where: { doctorId, patientId: { in: patientIds }, status: "completed" },
        _min: { startTime: true },
      })
    : [];
  const firstById = new Map(firstVisits.map((f) => [f.patientId, f._min.startTime]));

  return appointments.map((a) => {
    const first = firstById.get(a.patient.id);
    return {
      id: a.id,
      date: tbilisiParts(a.startTime).date,
      start: formatTime(a.startTime),
      end: formatTime(a.endTime),
      status: a.status,
      source: a.source,
      arrivedAt: a.arrivedAt ? formatTime(a.arrivedAt) : null,
      arrivedTs: a.arrivedAt?.getTime() ?? null,
      visitKind: first && first < a.startTime ? "repeat" : "first",
      comment: a.comment,
      patient: { id: a.patient.id, name: `${a.patient.firstName} ${a.patient.lastName}`, personalId: a.patient.personalId },
      encounter: a.encounter && {
        id: a.encounter.id,
        status: a.encounter.status,
        startedAt: formatTime(a.encounter.startedAt),
        startedTs: a.encounter.startedAt.getTime(),
        completedAt: a.encounter.completedAt ? formatTime(a.encounter.completedAt) : null,
        minutes: a.encounter.completedAt ? Math.max(1, Math.round((a.encounter.completedAt.getTime() - a.encounter.startedAt.getTime()) / 60_000)) : null,
      },
      orders: ordersOf(a.encounter?.id),
    };
  });
}

/** „ყურადღება“ ბლოკისთვის — ბოლო ამდენი დღის კვლევის პასუხები. */
export const RESULTS_DAYS = 3;
const ATTENTION_LIMIT = 8;

/**
 * ექიმის მთავარი გვერდის „ყურადღება“: წინა დღეებში დაუსრულებელი ჩანაწერები (draft) და ბოლო დღეების
 * მზა კვლევის პასუხები საკუთარ ვიზიტებზე. doctorUserId — encounters.doctor_id მომხმარებელს მიუთითებს.
 */
export async function loadDoctorAttention(doctorUserId: number, today: string) {
  const dayStart = tbilisiToDate(today, 0);
  const draftWhere = { doctorId: doctorUserId, status: "draft" as const, startedAt: { lt: dayStart } };
  const [drafts, draftCount, results, pendingOrders] = await Promise.all([
    prisma.encounter.findMany({
      where: draftWhere,
      select: { appointmentId: true, startedAt: true, patient: { select: { firstName: true, lastName: true } } },
      orderBy: { startedAt: "desc" },
      take: ATTENTION_LIMIT,
    }),
    prisma.encounter.count({ where: draftWhere }),
    prisma.medicalOrder.findMany({
      where: { status: "ready", performedAt: { gte: tbilisiToDate(addDays(today, 1 - RESULTS_DAYS), 0) }, encounter: { doctorId: doctorUserId } },
      select: {
        id: true,
        serviceName: true,
        performedAt: true,
        encounter: { select: { appointmentId: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { performedAt: "desc" },
      take: ATTENTION_LIMIT,
    }),
    prisma.medicalOrder.count({ where: { status: { in: ["ordered", "sample_taken"] }, encounter: { doctorId: doctorUserId } } }),
  ]);
  const when = (d: Date) => {
    const p = tbilisiParts(d);
    return `${p.date === today ? "დღეს" : formatDate(p.date)} ${formatTime(d)}`;
  };
  return {
    drafts: drafts.map((d) => ({ appointmentId: d.appointmentId, patient: `${d.patient.firstName} ${d.patient.lastName}`, when: when(d.startedAt) })),
    draftCount,
    results: results.map((r) => ({
      id: r.id,
      appointmentId: r.encounter.appointmentId,
      service: r.serviceName,
      patient: `${r.patient.firstName} ${r.patient.lastName}`,
      when: r.performedAt ? when(r.performedAt) : "",
    })),
    pendingOrders,
  };
}

export type DoctorAttention = Awaited<ReturnType<typeof loadDoctorAttention>>;

/** პაციენტი ჯავშნის ფორმისთვის (მიმართვა / განმეორებითი ვიზიტი ბარათიდან). */
export async function loadBookingPatient(patientId: number): Promise<BookingPatient | null> {
  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, personalId: true, firstName: true, lastName: true, phone: true, birthDate: true },
  });
  return p && { ...p, birthDate: formatDate(p.birthDate.toISOString().slice(0, 10)) };
}
