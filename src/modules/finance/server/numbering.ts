import type { Prisma } from "@/generated/prisma/client";

/**
 * თანმიმდევრული, უწყვეტი ნომრები წლის მიხედვით: INV-2026-000001 (ინვოისი), RCP-2026-000001 (ქვითარი).
 * მრიცხველი (number_sequences) იკეტება ტრანზაქციის ბოლომდე (FOR UPDATE) — ერთდროულ ოპერაციებს ერთი ნომერი არ ხვდება,
 * ჩავარდნილი ტრანზაქცია კი ნომერს არ „ხარჯავს“ (rollback). ამიტომ გამოიძახეთ მხოლოდ ტრანზაქციის შიგნით.
 */
export type NumberSeries = "INV" | "RCP";

export async function nextNumber(tx: Prisma.TransactionClient, series: NumberSeries, year: number): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO number_sequences (name, year, last_value) VALUES (${series}, ${year}, 0)
    ON DUPLICATE KEY UPDATE last_value = last_value
  `;
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    SELECT last_value FROM number_sequences WHERE name = ${series} AND year = ${year} FOR UPDATE
  `;
  const next = Number(rows[0].last_value) + 1;
  await tx.$executeRaw`UPDATE number_sequences SET last_value = ${next} WHERE name = ${series} AND year = ${year}`;
  return formatNumber(series, year, next);
}

export function formatNumber(series: NumberSeries, year: number, value: number): string {
  return `${series}-${year}-${String(value).padStart(6, "0")}`;
}
