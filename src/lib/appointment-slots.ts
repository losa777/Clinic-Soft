/**
 * ჯავშნის დრო და თავისუფალი სლოტების გამოთვლა. სუფთა ფუნქციებია (ბაზის გარეშე) — მუშაობს სერვერზეც და კლიენტზეც.
 *
 * დრო ბაზაში UTC-ში ინახება, გრაფიკი და ეკრანზე ჩვენება კი თბილისის დროითაა (Asia/Tbilisi).
 * საქართველოში მუდმივად UTC+4-ია (საზაფხულო დრო არ არის), ამიტომ გადაყვანა ფიქსირებული წანაცვლებით ხდება
 * (ისევე როგორც ადრე ვიზიტებში).
 */

export const CLINIC_TIME_ZONE = "Asia/Tbilisi";

const OFFSET_MINUTES = 4 * 60;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-22" რეალური თარიღია (არა 2026-02-30). */
export function isRealDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(date);
}

/** თარიღი + წუთები შუაღამიდან (თბილისის დროით) → მომენტი: ("2026-10-22", 570) → 2026-10-22T05:30:00Z. */
export function tbilisiToDate(date: string, minutes: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - OFFSET_MINUTES) * MINUTE_MS);
}

/** მომენტი → თბილისის თარიღი და წუთები შუაღამიდან. */
export function tbilisiParts(moment: Date): { date: string; minutes: number } {
  const shifted = new Date(moment.getTime() + OFFSET_MINUTES * MINUTE_MS);
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

/** დღევანდელი თარიღი თბილისში: "2026-10-22". */
export function tbilisiToday(now: Date = new Date()): string {
  return tbilisiParts(now).date;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** კვირის დღე: 1 — ორშაბათი ... 7 — კვირა (doctor_schedules.weekday). */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export const WEEKDAYS = ["ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი", "კვირა"] as const;

export function weekdayName(date: string): string {
  return WEEKDAYS[isoWeekday(date) - 1];
}

/** 570 → "09:30". */
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** მომენტი → "09:30" თბილისის დროით. */
export function formatTime(moment: Date): string {
  return formatMinutes(tbilisiParts(moment).minutes);
}

/** "2026-10-22" → "22.10.2026". */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/** სამუშაო ინტერვალი (წუთები შუაღამიდან, თბილისის დროით). */
export type WorkInterval = { start: number; end: number };

/** დაკავებული დრო (ჯავშანი). */
export type BusyInterval = { start: Date; end: Date };

/**
 * free — თავისუფალი; busy — ექიმს უკვე აქვს ჯავშანი; patient — პაციენტს ამ დროს სხვა ჯავშანი აქვს;
 * past — დრო გასულია.
 */
export type SlotState = "free" | "busy" | "patient" | "past";

/** სლოტი: start — ISO (UTC), time — "09:30" (თბილისი). */
export type Slot = { start: string; time: string; state: SlotState };

const overlaps = (start: Date, end: Date, busy: BusyInterval[]) =>
  busy.some((b) => b.start.getTime() < end.getTime() && start.getTime() < b.end.getTime());

/**
 * დღის სლოტები ექიმის გრაფიკიდან: ყოველი ინტერვალი იყოფა ვიზიტის ხანგრძლივობის ნაწილებად
 * (ბოლო, არასრული ნაწილი არ ითვლება). დაკავებული და გასული სლოტებიც ბრუნდება — ეკრანზე გათიშული ჩანს.
 */
export function buildSlots({
  date,
  intervals,
  duration,
  doctorBusy,
  patientBusy = [],
  now = new Date(),
}: {
  date: string;
  intervals: WorkInterval[];
  duration: number;
  doctorBusy: BusyInterval[];
  patientBusy?: BusyInterval[];
  now?: Date;
}): Slot[] {
  if (duration <= 0) return [];
  // ერთმანეთზე გადაფარული ინტერვალები ერთსა და იმავე სლოტს ორჯერ არ აჩვენებს
  const byStart = new Map<number, Slot>();

  for (const interval of intervals) {
    for (let m = interval.start; m + duration <= interval.end; m += duration) {
      const start = tbilisiToDate(date, m);
      if (byStart.has(start.getTime())) continue;
      const end = new Date(start.getTime() + duration * MINUTE_MS);
      const state: SlotState =
        start.getTime() <= now.getTime()
          ? "past"
          : overlaps(start, end, doctorBusy)
            ? "busy"
            : overlaps(start, end, patientBusy)
              ? "patient"
              : "free";
      byStart.set(start.getTime(), { start: start.toISOString(), time: formatMinutes(m), state });
    }
  }

  return [...byStart.entries()].sort(([a], [b]) => a - b).map(([, slot]) => slot);
}
