import { addDays, formatDate } from "../../lib/appointment-slots.ts";

/** ფინანსური ანალიზის წარწერები (სერვერი და ბრაუზერი). */

const MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];

/** "2026-10-24" → "24.10" (long: "24.10.2026"); "2026-10" → "ოქტ" (long: "ოქტ 2026"). */
export function bucketLabel(key: string, long = false): string {
  if (key.length === 10) return long ? formatDate(key) : `${key.slice(8, 10)}.${key.slice(5, 7)}`;
  const month = MONTHS[Number(key.slice(5, 7)) - 1];
  return long ? `${month} ${key.slice(0, 4)}` : month;
}

/** ცვლილება წინა პერიოდთან, %: წინა 0 — შედარება შეუძლებელია (null). */
export function changePercent(current: string | number, previous: string | number): number | null {
  const c = Number(current);
  const p = Number(previous);
  if (!p) return null;
  return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
}

export type Grouping = "day" | "month";

/** 62 დღემდე — დღეებით, მეტი — თვეებით. */
export const groupingFor = (from: string, to: string): Grouping =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 < 62 ? "day" : "month";

/** პერიოდის ყველა დღე/თვე (ცარიელიც — გრაფიკში ხვრელი არ უნდა იყოს). */
export function bucketKeys(from: string, to: string, grouping: Grouping): string[] {
  const keys: string[] = [];
  if (grouping === "day") {
    for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
    return keys;
  }
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const last = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    keys.push(key);
    if (key >= last) return keys;
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
}
