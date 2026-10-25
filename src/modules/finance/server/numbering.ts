import type { Prisma } from "@/generated/prisma/client";

/**
 * თანმიმდევრული, უწყვეტი ნომრები: INV-2026-000001 (ინვოისი), RCP-2026-000001 (ქვითარი), ISS-2026-000001 (პრობლემა), ფორმა 100-ის ცნობა (F100, უწყვეტი),
 * სამედიცინო ბარათი (CARD, წლის მიხედვით: 6914/2026).
 * მრიცხველი (number_sequences) იკეტება ტრანზაქციის ბოლომდე (FOR UPDATE) — ერთდროულ ოპერაციებს ერთი ნომერი არ ხვდება,
 * ჩავარდნილი ტრანზაქცია კი ნომერს არ „ხარჯავს“ (rollback). ამიტომ გამოიძახეთ მხოლოდ ტრანზაქციის შიგნით.
 */
export type NumberSeries = "INV" | "RCP" | "ISS";
export type SequenceName = NumberSeries | "F100" | "CARD";

/** უწყვეტი მრიცხველები (წლის გარეშე) — year = 0. */
export const NO_YEAR = 0;

export async function nextSequenceValue(tx: Prisma.TransactionClient, name: SequenceName, year: number): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO number_sequences (name, year, last_value) VALUES (${name}, ${year}, 0)
    ON DUPLICATE KEY UPDATE last_value = last_value
  `;
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    SELECT last_value FROM number_sequences WHERE name = ${name} AND year = ${year} FOR UPDATE
  `;
  const next = Number(rows[0].last_value) + 1;
  await tx.$executeRaw`UPDATE number_sequences SET last_value = ${next} WHERE name = ${name} AND year = ${year}`;
  return next;
}

export async function nextNumber(tx: Prisma.TransactionClient, series: NumberSeries, year: number): Promise<string> {
  return formatNumber(series, year, await nextSequenceValue(tx, series, year));
}

export function formatNumber(series: NumberSeries, year: number, value: number): string {
  return `${series}-${year}-${String(value).padStart(6, "0")}`;
}
