import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { fieldErrorsOf } from "@/lib/zod-errors";

/** წარუმატებელი პასუხი: საერთო შეცდომა და/ან შეცდომები ველების მიხედვით. */
export type ActionFailure = { ok: false; error?: string; fieldErrors?: Record<string, string> };

/** Server Action-ის პასუხი ფორმებისთვის. */
export type ActionResult = { ok: true; message: string } | ActionFailure;

export function success(message: string): ActionResult {
  return { ok: true, message };
}

export function failure(error: string, fieldErrors?: Record<string, string>): ActionFailure {
  return { ok: false, error, fieldErrors };
}

/** zod-ის შეცდომები → { ველი: პირველი შეტყობინება }. */
export function invalid(error: z.ZodError): ActionFailure {
  return { ok: false, error: "შეასწორეთ მონიშნული ველები", fieldErrors: fieldErrorsOf(error) };
}

/** UNIQUE შეზღუდვის დარღვევა (მაგ. უკვე არსებული username). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
