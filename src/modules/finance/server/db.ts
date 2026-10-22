import type { Prisma } from "@/generated/prisma/client";
import { addDays, tbilisiParts, tbilisiToDate, tbilisiToday } from "@/lib/appointment-slots";
import { fromTetri, type Tetri, toTetri } from "@/modules/finance/calc";

/** prisma ან ტრანზაქციის კლიენტი. */
export type Db = Prisma.TransactionClient;

/**
 * DECIMAL → თეთრი. Prisma აბრუნებს Decimal-ს, $queryRaw — Decimal-ს, სტრიქონს ან რიცხვს (დრაივერის მიხედვით),
 * COUNT — bigint-ს. null/undefined → 0 (მაგ. SUM ცარიელ სიმრავლეზე).
 */
export function tetri(value: unknown): Tetri {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value) * 100;
  if (typeof value === "number") return toTetri(value.toFixed(2));
  if (typeof value === "object" && "toFixed" in value) return toTetri((value as { toFixed(n: number): string }).toFixed(2));
  return toTetri(Number(String(value)).toFixed(2));
}

/** თეთრი → DECIMAL სტრიქონი Prisma-სთვის. */
export const dec = fromTetri;

/** COUNT და სხვა მთელი რიცხვები $queryRaw-იდან (bigint). */
export const int = (value: unknown) => Number(value ?? 0);

/** თბილისის დღის საზღვრები UTC-ში: [დღის დასაწყისი, შემდეგი დღის დასაწყისი). */
export function dayRange(date: string): { from: Date; to: Date } {
  return { from: tbilisiToDate(date, 0), to: tbilisiToDate(addDays(date, 1), 0) };
}

/** თარიღების შუალედი (ორივე დღე ჩათვლით). */
export function periodRange(from: string, to: string): { from: Date; to: Date } {
  return { from: tbilisiToDate(from, 0), to: tbilisiToDate(addDays(to, 1), 0) };
}

/** მიმდინარე წელი თბილისში (ნომრებისთვის: INV-2026-...). */
export const currentYear = (now = new Date()) => Number(tbilisiParts(now).date.slice(0, 4));

/** დღევანდელი თარიღი თბილისში, DATE სვეტთან შესადარებლად (UTC შუაღამე). */
export const todayAsDate = () => new Date(`${tbilisiToday()}T00:00:00Z`);

const dateTimeFormat = new Intl.DateTimeFormat("ka-GE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tbilisi",
});
const dateFormat = new Intl.DateTimeFormat("ka-GE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export const formatDateTime = (d: Date) => dateTimeFormat.format(d);
/** DATE სვეტი (UTC შუაღამე) → "22.10.2026". */
export const formatDay = (d: Date) => dateFormat.format(d);

export const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}` : null);
