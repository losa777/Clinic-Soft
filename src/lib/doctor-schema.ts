/**
 * ექიმის პროფილი (სპეციალობა, ვიზიტის ხანგრძლივობა, კაბინეტი) და კვირის სამუშაო განრიგი —
 * ვალიდაცია და დამხმარე ფუნქციები, საერთო კლიენტისა და სერვერისთვის.
 */
import { z } from "zod";
import { formatMinutes, WEEKDAYS } from "@/lib/appointment-slots";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "09:30" → 570. */
export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** TIME სვეტი Prisma-ში 1970-01-01-ის თარიღად მოდის (UTC) → "09:30". */
export function timeOfDate(t: Date): string {
  return formatMinutes(t.getUTCHours() * 60 + t.getUTCMinutes());
}

/** "09:30" → TIME სვეტის მნიშვნელობა Prisma-სთვის. */
export function dateOfTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}

export const MAX_INTERVALS_PER_DAY = 6;

const timeSchema = z.string().regex(TIME_PATTERN, "მიუთითეთ დრო");

export const scheduleIntervalSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    start: timeSchema,
    end: timeSchema,
  })
  .refine((i) => parseTime(i.end) > parseTime(i.start), "დასრულების დრო დაწყებაზე გვიან უნდა იყოს");

export type ScheduleInterval = z.infer<typeof scheduleIntervalSchema>;

export const doctorSchema = z
  .object({
    userId: z.number().int().positive(),
    specialtyId: z.number({ error: "აირჩიეთ სპეციალობა" }).int().positive("აირჩიეთ სპეციალობა"),
    visitDuration: z
      .number({ error: "მიუთითეთ ხანგრძლივობა წუთებში" })
      .int("მთელი რიცხვი წუთებში")
      .min(5, "მინიმუმ 5 წუთი")
      .max(240, "მაქსიმუმ 240 წუთი"),
    room: z
      .string()
      .trim()
      .max(20, "მაქსიმუმ 20 სიმბოლო")
      .transform((v) => v || null),
    isActive: z.boolean(),
    /** კონსულტაციის სერვისი: ჯავშნიდან ინვოისში ავტომატურად ჩაჯდება (null — არ არის) */
    consultationServiceId: z.number().int().positive().nullable(),
    schedule: z.array(scheduleIntervalSchema).max(7 * MAX_INTERVALS_PER_DAY),
  })
  .superRefine((d, ctx) => {
    // ერთი დღის ინტერვალები ერთმანეთს არ უნდა ფარავდეს
    for (let day = 1; day <= 7; day++) {
      const list = d.schedule
        .filter((i) => i.weekday === day)
        .map((i) => ({ start: parseTime(i.start), end: parseTime(i.end) }))
        .sort((a, b) => a.start - b.start);
      if (list.length > MAX_INTERVALS_PER_DAY) {
        ctx.addIssue({ code: "custom", path: ["schedule"], message: `${WEEKDAYS[day - 1]}: მაქსიმუმ ${MAX_INTERVALS_PER_DAY} ინტერვალი` });
      }
      if (list.some((i, n) => n > 0 && i.start < list[n - 1].end)) {
        ctx.addIssue({ code: "custom", path: ["schedule"], message: `${WEEKDAYS[day - 1]}: საათები ერთმანეთს ფარავს` });
      }
    }
  });

export type DoctorInput = z.input<typeof doctorSchema>;

/** განრიგის მოკლე აღწერა სიისთვის: "ორშ–პარ 09:00–13:00, 14:00–18:00; შაბ 10:00–14:00". */
export function scheduleSummary(schedule: ScheduleInterval[]): string {
  if (!schedule.length) return "";
  // დღეები, რომლებსაც ერთნაირი საათები აქვთ, ერთად
  const byDay = new Map<number, string>();
  for (const i of [...schedule].sort((a, b) => a.weekday - b.weekday || parseTime(a.start) - parseTime(b.start))) {
    const hours = `${i.start}–${i.end}`;
    byDay.set(i.weekday, byDay.has(i.weekday) ? `${byDay.get(i.weekday)}, ${hours}` : hours);
  }

  const groups: { from: number; to: number; hours: string }[] = [];
  for (const [day, hours] of byDay) {
    const last = groups.at(-1);
    if (last && last.hours === hours && last.to === day - 1) last.to = day;
    else groups.push({ from: day, to: day, hours });
  }
  const short = (d: number) => WEEKDAYS[d - 1].slice(0, 3);
  return groups.map((g) => `${short(g.from)}${g.to > g.from ? `–${short(g.to)}` : ""} ${g.hours}`).join("; ");
}
