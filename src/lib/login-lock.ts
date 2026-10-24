/**
 * შესვლის დაბლოკვის წესი (სუფთა ფუნქციები, ტესტებით — login-lock.test.mts; ბაზა — login-guard.ts).
 * მომხმარებელი: 5 წარუმატებელი ცდა 15 წუთში (ბოლო წარმატებული შესვლის / ადმინის განბლოკვის შემდეგ) → 15 წუთი ბლოკი.
 * IP: 20 წარუმატებელი ცდა 15 წუთში (ნებისმიერი სახელით — სახელების გადარჩევა) → 15 წუთი ბლოკი.
 * ბლოკი ბოლო წარუმატებელი ცდიდან ითვლება; დაბლოკვის დროს ცდები ბლოკს არ აგრძელებს.
 */

export const USER_MAX_FAILURES = 5;
export const IP_MAX_FAILURES = 20;
export const LOCK_WINDOW_MS = 15 * 60 * 1000;

/** ბლოკის დასასრული ან null. failures — წარუმატებელი ცდების დროები (ნებისმიერი რიგით). */
export function lockedUntil(failures: Date[], max: number, now: Date, since: Date | null = null): Date | null {
  const from = Math.max(now.getTime() - LOCK_WINDOW_MS, since?.getTime() ?? 0);
  const recent = failures.map((d) => d.getTime()).filter((t) => t > from);
  if (recent.length < max) return null;
  const until = Math.max(...recent) + LOCK_WINDOW_MS;
  return until > now.getTime() ? new Date(until) : null;
}

/** დარჩენილი წუთები (მინიმუმ 1) — შეტყობინებისთვის. */
export const minutesLeft = (until: Date, now: Date) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
