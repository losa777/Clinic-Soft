import { addDays, formatDate, formatTime, tbilisiParts, WEEKDAYS } from "../../lib/appointment-slots.ts";

/** ჩატის დრო თბილისის დროით (სუფთა ფუნქციები, ტესტებით — time.test.mts). */

const MONTHS = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];

const dayOf = (iso: string) => tbilisiParts(new Date(iso)).date;

/** "09:30" */
export function messageTime(iso: string): string {
  return formatTime(new Date(iso));
}

/** ერთ დღეს ეკუთვნის? (დღეების გამყოფი ისტორიაში) */
export function sameDay(a: string, b: string): boolean {
  return dayOf(a) === dayOf(b);
}

/** დღის გამყოფი: „დღეს“, „გუშინ“, „22 ოქტომბერი“, სხვა წელს — „22 ოქტომბერი 2025“. */
export function dayLabel(iso: string, now = new Date()): string {
  const date = dayOf(iso);
  const today = tbilisiParts(now).date;
  if (date === today) return "დღეს";
  if (date === addDays(today, -1)) return "გუშინ";
  const [y, m, d] = date.split("-");
  const label = `${Number(d)} ${MONTHS[Number(m) - 1]}`;
  return y === today.slice(0, 4) ? label : `${label} ${y}`;
}

/** საუბრების სიაში: დღეს — „09:30“, გუშინ — „გუშინ“, ბოლო კვირაში — კვირის დღე, სხვაგვარად — „22.10.2026“. */
export function listTime(iso: string, now = new Date()): string {
  const date = dayOf(iso);
  const today = tbilisiParts(now).date;
  if (date === today) return messageTime(iso);
  if (date === addDays(today, -1)) return "გუშინ";
  if (date > addDays(today, -7)) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return WEEKDAYS[day === 0 ? 6 : day - 1];
  }
  return formatDate(date);
}

/** „ბოლოს იყო: დღეს 09:30“ / „გუშინ 18:05“ / „22.10.2026 18:05“; უცნობი — „გასულია“. */
export function lastSeenText(iso: string | null, now = new Date()): string {
  if (!iso) return "გასულია";
  const date = dayOf(iso);
  const today = tbilisiParts(now).date;
  const time = messageTime(iso);
  if (date === today) return `ბოლოს იყო: დღეს ${time}`;
  if (date === addDays(today, -1)) return `ბოლოს იყო: გუშინ ${time}`;
  return `ბოლოს იყო: ${formatDate(date)} ${time}`;
}

/** სრული დრო (title-ისთვის): „22.10.2026 09:30“. */
export function fullTime(iso: string): string {
  return `${formatDate(dayOf(iso))} ${messageTime(iso)}`;
}
