import "server-only";
import { prisma } from "@/lib/db";
import { IP_MAX_FAILURES, LOCK_WINDOW_MS, lockedUntil, USER_MAX_FAILURES } from "@/lib/login-lock";

/**
 * შესვლის დაცვა ბაზაში (login_attempts): ცდების ჩაწერა და ბლოკის შემოწმება (წესი — login-lock.ts).
 * მოწმდება auth.ts-ის authorize-ში — ყოველ გზაზე (ფორმაც და /api/auth/callback/credentials-იც).
 */

export type AttemptKind = "failed" | "blocked" | "success" | "unlock";

/** ძველი ჩანაწერები (90 დღე) — ცხრილი არ იზრდება უსასრულოდ. */
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;

const normalize = (username: string) => username.trim().toLowerCase().slice(0, 50);

export async function recordAttempt(username: string, ip: string | null, kind: AttemptKind) {
  await prisma.loginAttempt.create({ data: { username: normalize(username), ip, kind, createdAt: new Date() } });
  if (kind === "success") {
    await prisma.$executeRaw`DELETE FROM login_attempts WHERE created_at < ${new Date(Date.now() - KEEP_MS)} LIMIT 1000`;
  }
}

export type LockState = { until: Date; reason: "user" | "ip" } | null;

/** დაბლოკილია თუ არა მომხმარებლის სახელი ან IP (ბოლო 15 წუთის წარუმატებელი ცდებით). */
export async function checkLock(username: string, ip: string | null, now = new Date()): Promise<LockState> {
  const since = new Date(now.getTime() - LOCK_WINDOW_MS);
  const name = normalize(username);
  const [userRows, reset, ipRows] = await Promise.all([
    prisma.loginAttempt.findMany({ where: { username: name, kind: "failed", createdAt: { gt: since } }, select: { createdAt: true } }),
    prisma.loginAttempt.findFirst({ where: { username: name, kind: { in: ["success", "unlock"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ip ? prisma.loginAttempt.findMany({ where: { ip, kind: "failed", createdAt: { gt: since } }, select: { createdAt: true } }) : Promise.resolve([]),
  ]);
  const userUntil = lockedUntil(userRows.map((r) => r.createdAt), USER_MAX_FAILURES, now, reset?.createdAt ?? null);
  if (userUntil) return { until: userUntil, reason: "user" };
  const ipUntil = lockedUntil(ipRows.map((r) => r.createdAt), IP_MAX_FAILURES, now);
  return ipUntil ? { until: ipUntil, reason: "ip" } : null;
}

/** ადმინის „განბლოკვა“: ათვლა თავიდან (წინა წარუმატებელი ცდები აღარ ითვლება). */
export function unlockUsername(username: string) {
  return prisma.loginAttempt.create({ data: { username: normalize(username), ip: null, kind: "unlock", createdAt: new Date() } });
}

/** მომხმარებლების სიისთვის: რომელი სახელებია ახლა დაბლოკილი (და რამდენ ხანს). */
export async function lockedUsernames(usernames: string[], now = new Date()): Promise<Map<string, Date>> {
  const since = new Date(now.getTime() - LOCK_WINDOW_MS);
  const names = usernames.map(normalize);
  const failed = await prisma.loginAttempt.findMany({
    where: { username: { in: names }, kind: "failed", createdAt: { gt: since } },
    select: { username: true, createdAt: true },
  });
  const result = new Map<string, Date>();
  const candidates = [...new Set(failed.map((f) => f.username))];
  if (!candidates.length) return result;
  const resets = await prisma.loginAttempt.groupBy({
    by: ["username"],
    where: { username: { in: candidates }, kind: { in: ["success", "unlock"] } },
    _max: { createdAt: true },
  });
  for (const name of candidates) {
    const until = lockedUntil(
      failed.filter((f) => f.username === name).map((f) => f.createdAt),
      USER_MAX_FAILURES,
      now,
      resets.find((r) => r.username === name)?._max.createdAt ?? null,
    );
    if (until) result.set(name, until);
  }
  return result;
}
