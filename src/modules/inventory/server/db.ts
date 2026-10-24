import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, failure } from "@/lib/action-result";
import { prisma } from "@/lib/db";

/** prisma ან ტრანზაქციის კლიენტი. */
export type Db = Prisma.TransactionClient;

/** მომხმარებლისთვის განკუთვნილი შეცდომა (ტრანზაქცია უქმდება, ტექსტი ფორმაში ჩანს). */
export class InventoryError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export function inventoryFailure(error: unknown): ActionFailure {
  if (error instanceof InventoryError) return failure(error.message, error.fieldErrors);
  throw error;
}

/** READ COMMITTED: პარტიების ჩაკეტვის (FOR UPDATE) შემდეგ წაკითხვა ბოლო დადასტურებულ ნაშთს ხედავს. */
export function inventoryTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
}

/** DATE სვეტი (Date UTC შუაღამე ან სტრიქონი — დრაივერის მიხედვით) → "2026-10-24". */
export function dateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/** "2026-10-24" → Date (UTC შუაღამე) DATE სვეტისთვის. */
export const dateValue = (date: string) => new Date(`${date}T00:00:00Z`);
