import { z } from "zod";

/**
 * თანხები ლარში. ფორმებიდან და სერვერიდან სტრიქონად მოდის ("25.50"), რომ ათწილადი არ დამრგვალდეს;
 * კლიენტზე ჯამი თეთრებში (მთელ რიცხვებში) ითვლება.
 */
const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

/** თანხის ველი: "25", "25.50" ან "25,50" → "25.50"-ის ფორმატის სტრიქონი. */
export const moneySchema = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .pipe(z.string().regex(MONEY_PATTERN, message));

/**
 * "1234.5" → "1 234,50 ₾" (ქართული ფორმატი). Intl.NumberFormat("ka-GE") აქ არ გამოდგება: ბრაუზერების ნაწილს
 * ka-GE-ის მონაცემები არ აქვს ("GEL 1,234.50"), სერვერზე კი სხვა შედეგი მოდის — hydration-ის შეცდომა.
 */
export function formatGel(amount: string | number): string {
  const [int, frac] = Math.abs(Number(amount)).toFixed(2).split(".");
  // ქართულში ოთხნიშნა რიცხვი არ იყოფა: "1000,00 ₾", მაგრამ "10 000,00 ₾"
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : int;
  return `${Number(amount) < 0 ? "-" : ""}${grouped},${frac} ₾`;
}

export function toTetri(amount: string): number {
  return Math.round(Number(amount.replace(",", ".")) * 100);
}

export function fromTetri(tetri: number): string {
  return (tetri / 100).toFixed(2);
}
