import { addDays, isRealDate, tbilisiToday } from "@/lib/appointment-slots";

/** გვერდის searchParams-ის წაკითხვა (ფილტრები URL-შია, რომ ბმული/განახლება ფილტრს ინარჩუნებდეს). */
export type SearchParams = Record<string, string | string[] | undefined>;

export const param = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

export const positiveInt = (v: string | string[] | undefined) => {
  const s = param(v);
  return /^\d{1,9}$/.test(s) && Number(s) > 0 ? Number(s) : null;
};

export const dateParam = (v: string | string[] | undefined, fallback: string) => (isRealDate(param(v)) ? param(v) : fallback);

/** პერიოდი ?from=&to= (ნაგულისხმევად ბოლო `days` დღე); მაქს. 366 დღე — ძალიან დიდი შუალედი არ წაიკითხება. */
export function periodParams(params: SearchParams, days = 30): { from: string; to: string } {
  const today = tbilisiToday();
  let to = dateParam(params.to, today);
  let from = dateParam(params.from, addDays(to, -(days - 1)));
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -365)) from = addDays(to, -365);
  return { from, to };
}

/** ბმული იმავე გვერდზე შეცვლილი პარამეტრებით (ცარიელი მნიშვნელობა — იშლება). */
export function withParams(path: string, params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
