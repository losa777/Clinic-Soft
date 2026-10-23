import "server-only";
import { z } from "zod";
import { auth } from "@/auth";
import { RATE_LIMITS, type RateLimitKind } from "@/modules/chat/config";
import { RateLimiter } from "@/modules/chat/rate-limit";
import { ChatError } from "@/modules/chat/server/errors";

/**
 * Route Handler-ების საერთო ნაწილი: სესია (proxy /api/*-ს არ ამოწმებს — აქ მოწმდება), შეცდომები → JSON, rate limit.
 * Auth.js ყოველ მოთხოვნაზე ამოწმებს ბაზაში is_active-ს: გათიშული თანამშრომელი 401-ს იღებს.
 */

export type ChatMe = { id: number; sid: string | null };

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

export async function chatHandler(fn: (me: ChatMe) => Promise<unknown>): Promise<Response> {
  const session = await auth();
  if (!session?.user) return json({ error: "ავტორიზაცია საჭიროა" }, 401);
  try {
    const result = await fn({ id: Number(session.user.id), sid: session.user.sid ?? null });
    return result instanceof Response ? result : json(result ?? { ok: true });
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "არასწორი მონაცემები" }, 400);
    console.error("ჩატის API-ს შეცდომა:", error);
    return json({ error: "სერვერის შეცდომა, სცადეთ თავიდან" }, 500);
  }
}

const JSON_BODY_MAX_BYTES = 64 * 1024;

/** JSON body ზომის შემოწმებით + zod. */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  const text = await request.text();
  if (text.length > JSON_BODY_MAX_BYTES) throw new ChatError("მოთხოვნა ძალიან დიდია", 413);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ChatError("არასწორი მოთხოვნა");
  }
  return schema.parse(data);
}

/** query-სტრიქონი → zod. */
export function readQuery<S extends z.ZodType>(request: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(params);
}

/** მარშრუტის [id] → დადებითი მთელი; სხვაგვარად 404. */
export function parseId(raw: string): number {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ChatError("ვერ მოიძებნა", 404);
  return n;
}

const limiters = Object.fromEntries(
  Object.entries(RATE_LIMITS).map(([kind, l]) => [kind, new RateLimiter(l.capacity, l.windowMs)]),
) as Record<RateLimitKind, RateLimiter>;

export function rateLimit(kind: RateLimitKind, userId: number) {
  if (!limiters[kind].take(String(userId))) throw new ChatError("ძალიან ბევრი მოთხოვნაა — მოიცადეთ რამდენიმე წამი", 429);
}
