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
  encounter: { id: number; status: "draft" | "completed" } | null;
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
      encounter: { select: { id: true, status: true } },
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
  });

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
      encounter: a.encounter,
    };
  });
}

/** პაციენტი ჯავშნის ფორმისთვის (მიმართვა / განმეორებითი ვიზიტი ბარათიდან). */
export async function loadBookingPatient(patientId: number): Promise<BookingPatient | null> {
  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, personalId: true, firstName: true, lastName: true, phone: true, birthDate: true },
  });
  return p && { ...p, birthDate: formatDate(p.birthDate.toISOString().slice(0, 10)) };
}
