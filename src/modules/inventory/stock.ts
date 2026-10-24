/**
 * საწყობის გამოთვლები: რაოდენობა (DECIMAL(12,2) — მეასედებში, მთელ რიცხვებად), FEFO განაწილება პარტიებზე,
 * ვადის და ნაშთის მდგომარეობა. სუფთა ფუნქციები (სერვერი და ბრაუზერი), ტესტებით — stock.test.mts.
 */

/** რაოდენობა მეასედებში: "2.5" → 250. */
export type Hundredths = number;

/** ვადის გაფრთხილება: ამდენ დღეში ვადაგასვლა „იწურება“-ა. */
export const EXPIRY_WARNING_DAYS = 30;

/** მაქსიმალური რაოდენობა ერთ ოპერაციაში (DECIMAL(12,2)-ში ეტევა). */
export const MAX_QUANTITY = 1_000_000;

const QUANTITY_PATTERN = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/** "2,5" / "2.50" / 2.5 → 250; არასწორი ფორმატი — null. */
export function parseQuantity(value: string | number): Hundredths | null {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = QUANTITY_PATTERN.exec(s);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 250 → "2.50" (DECIMAL-ისთვის). */
export function toDecimal(h: Hundredths): string {
  const sign = h < 0 ? "-" : "";
  const abs = Math.abs(h);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** ბაზის DECIMAL (Prisma Decimal / სტრიქონი / რიცხვი) → მეასედები. */
export function fromDecimal(value: { toFixed(digits: number): string } | string | number | null | undefined): Hundredths {
  if (value === null || value === undefined) return 0;
  const s = typeof value === "string" ? value : value.toFixed(2);
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?/.exec(s.trim());
  if (!match) return 0;
  const h = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -h : h;
}

/** 250 → "2,5"; 300 → "3" (ეკრანზე: ზედმეტი ნულების გარეშე, ქართული მძიმით). */
export function formatQuantity(h: Hundredths): string {
  const sign = h < 0 ? "-" : "";
  const abs = Math.abs(h);
  const int = String(Math.floor(abs / 100));
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : int;
  const frac = String(abs % 100).padStart(2, "0").replace(/0+$/, "");
  return `${sign}${grouped}${frac ? `,${frac}` : ""}`;
}

/** 1234500 → "12345", 250 → "2.5" (ფორმის ველისთვის — parseQuantity-ით ბრუნდება უკან). */
export const inputQuantity = (h: Hundredths) => toDecimal(h).replace(/\.?0+$/, "");

export type BatchStock ={ id: number; expiryDate: string | null; quantity: Hundredths };

/** ვადა გასულია: ვარგისია ვადის დღის ჩათვლით (expiry < today). */
export const isExpired = (expiryDate: string | null, today: string) => expiryDate !== null && expiryDate < today;

/** FEFO რიგი: ჯერ ყველაზე ადრე ვადაგასული, ვადის გარეშე — ბოლოს; თანაბარ ვადაზე — ძველი პარტია (id). */
export function fefoOrder<T extends BatchStock>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    if (a.expiryDate !== b.expiryDate) {
      if (a.expiryDate === null) return 1;
      if (b.expiryDate === null) return -1;
      return a.expiryDate < b.expiryDate ? -1 : 1;
    }
    return a.id - b.id;
  });
}

export type Allocation = { batchId: number; quantity: Hundredths };

/**
 * გახარჯვა FEFO-თი: ვადაგასული პარტიები გამოტოვდება. აბრუნებს განაწილებას ან null-ს — თუ ვარგისი ნაშთი არ ჰყოფნის.
 */
export function allocateFefo(batches: BatchStock[], quantity: Hundredths, today: string): Allocation[] | null {
  if (quantity <= 0) return null;
  const result: Allocation[] = [];
  let left = quantity;
  for (const b of fefoOrder(batches)) {
    if (left === 0) break;
    if (b.quantity <= 0 || isExpired(b.expiryDate, today)) continue;
    const take = Math.min(b.quantity, left);
    result.push({ batchId: b.id, quantity: take });
    left -= take;
  }
  return left === 0 ? result : null;
}

/** ვარგისი (ვადაგაუსვლელი) ნაშთი. */
export const usableQuantity = (batches: BatchStock[], today: string) =>
  batches.reduce((s, b) => (b.quantity > 0 && !isExpired(b.expiryDate, today) ? s + b.quantity : s), 0);

/** "2026-10-24" + n დღე (UTC-ით, თარიღის სტრიქონზე). */
export function addDaysTo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ExpiryStatus = "expired" | "expiring" | "ok" | "none";

export function expiryStatus(expiryDate: string | null, today: string): ExpiryStatus {
  if (expiryDate === null) return "none";
  if (expiryDate < today) return "expired";
  return expiryDate <= addDaysTo(today, EXPIRY_WARNING_DAYS) ? "expiring" : "ok";
}

export type StockLevel = "out" | "low" | "ok";

/** ნაშთის დონე: 0 — ამოიწურა, მინიმუმზე ნაკლები (ან ტოლი) — მცირეა. მინიმუმი 0 — გაფრთხილების გარეშე. */
export function stockLevel(quantity: Hundredths, minQuantity: Hundredths): StockLevel {
  if (quantity <= 0) return "out";
  return minQuantity > 0 && quantity <= minQuantity ? "low" : "ok";
}
