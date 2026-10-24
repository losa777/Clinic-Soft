"use server";

import { revalidatePath } from "next/cache";
import { type ActionFailure, failure, invalid } from "@/lib/action-result";
import { isoWeekday, tbilisiParts } from "@/lib/appointment-slots";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { dateOfTime, type DoctorInput, doctorSchema, parseTime, type ScheduleInterval } from "@/lib/doctor-schema";

export type DoctorSaveResult = { ok: true; message: string; outsideSchedule: number } | ActionFailure;

const PATH = "/admin/doctors";

/** ჯავშანი მთლიანად ხვდება განრიგის რომელიმე ინტერვალში (თბილისის დროით). */
function fitsSchedule(start: Date, end: Date, schedule: ScheduleInterval[]): boolean {
  const s = tbilisiParts(start);
  const e = tbilisiParts(end);
  const endMinutes = e.date === s.date ? e.minutes : 24 * 60;
  const weekday = isoWeekday(s.date);
  return schedule.some((i) => i.weekday === weekday && parseTime(i.start) <= s.minutes && endMinutes <= parseTime(i.end));
}

/**
 * ექიმის პროფილისა და განრიგის შენახვა (პროფილი იქმნება, თუ ჯერ არ აქვს). განრიგი მთლიანად იცვლება.
 * არსებული ჯავშნები არ იცვლება — ბრუნდება იმ მომავალი ჯავშნების რაოდენობა, რომლებიც ახალ განრიგს აღარ ემთხვევა.
 */
export async function saveDoctor(input: DoctorInput): Promise<DoctorSaveResult> {
  await requireRole("admin");
  const parsed = doctorSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { userId, schedule, ...profile } = parsed.data;

  const [user, specialty, service] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { code: true } } } }),
    prisma.specialty.count({ where: { id: profile.specialtyId } }),
    profile.consultationServiceId ? prisma.service.count({ where: { id: profile.consultationServiceId, isActive: true } }) : 1,
  ]);
  if (!user) return failure("მომხმარებელი ვერ მოიძებნა");
  if (user.role.code !== "doctor") return failure("პროფილი შეიძლება მიენიჭოს მხოლოდ „ექიმის“ როლის მომხმარებელს");
  if (!specialty) return failure("შეასწორეთ მონიშნული ველები", { specialtyId: "სპეციალობა ვერ მოიძებნა" });
  if (!service) return failure("შეასწორეთ მონიშნული ველები", { consultationServiceId: "სერვისი ვერ მოიძებნა ან გათიშულია" });

  // ჯავშანი ექიმის ჩანაწერს კეტავს (FOR UPDATE), ამიტომ განრიგის შეცვლა და ჯავშანი ერთმანეთს არ ემთხვევა
  const doctorId = await prisma.$transaction(async (tx) => {
    const doctor = await tx.doctor.upsert({ where: { userId }, create: { userId, ...profile }, update: profile, select: { id: true } });
    await tx.doctorSchedule.deleteMany({ where: { doctorId: doctor.id } });
    await tx.doctorSchedule.createMany({
      data: schedule.map((i) => ({ doctorId: doctor.id, weekday: i.weekday, startTime: dateOfTime(i.start), endTime: dateOfTime(i.end) })),
    });
    return doctor.id;
  });

  const upcoming = await prisma.appointment.findMany({
    where: { doctorId, status: "booked", startTime: { gt: new Date() } },
    select: { startTime: true, endTime: true },
  });
  const outsideSchedule = profile.isActive
    ? upcoming.filter((a) => !fitsSchedule(a.startTime, a.endTime, schedule)).length
    : upcoming.length;

  revalidatePath(PATH);
  return { ok: true, message: "ექიმის მონაცემები და განრიგი შენახულია", outsideSchedule };
}
