import type { IncomingMessage } from "node:http";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import type { SocketData } from "@/modules/chat/realtime/registry";

/** სესიის მაქსიმალური ხანგრძლივობა (auth.ts-ის session.maxAge) — თუ ტოკენს exp არ აქვს. */
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const SECURE_COOKIE = "__Secure-authjs.session-token";

/**
 * სოკეტის ავტორიზაცია Auth.js-ის სესიის cookie-ით (იგივე JWT, AUTH_SECRET-ით გაშიფრული; ვადაგასული — უარყოფილი).
 * შემდეგ — ბაზაში: მომხმარებელი უნდა არსებობდეს და აქტიური იყოს (როგორც auth.ts-ის jwt callback-ში).
 */
export async function authenticateSocket(req: IncomingMessage): Promise<SocketData | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("გარემოს ცვლადი AUTH_SECRET არ არის მითითებული (.env.local)");
  const cookie = req.headers.cookie ?? "";
  const token = await getToken({
    req: { headers: { cookie } },
    secret,
    // https-ზე Auth.js cookie-ს __Secure- პრეფიქსით წერს (და სხვა salt-ით შიფრავს)
    secureCookie: cookie.includes(SECURE_COOKIE),
  });
  const userId = Number(token?.id);
  if (!token || !Number.isSafeInteger(userId)) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!user?.isActive) return null;

  return {
    userId,
    sid: typeof token.sid === "string" ? token.sid : null,
    expiresAt: typeof token.exp === "number" ? token.exp * 1000 : Date.now() + SESSION_MAX_AGE_MS,
  };
}

/**
 * Cross-Site WebSocket Hijacking-ის წინააღმდეგ: ბრაუზერიდან კავშირი მხოლოდ იმავე საიტიდან (Origin = Host).
 * reverse proxy-ის უკან — X-Forwarded-Host. Origin-ის გარეშე (არა ბრაუზერი) — cookie მაინც საჭიროა.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const forwarded = req.headers["x-forwarded-host"];
  const hosts = [req.headers.host, ...(typeof forwarded === "string" ? forwarded.split(",") : [])].map((h) => h?.trim().toLowerCase());
  try {
    return hosts.includes(new URL(origin).host.toLowerCase());
  } catch {
    return false;
  }
}
