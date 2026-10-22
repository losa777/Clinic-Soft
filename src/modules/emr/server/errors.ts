import { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, failure } from "@/lib/action-result";

/** მომხმარებლისთვის განკუთვნილი შეცდომა EMR-ის ტრანზაქციიდან (ტრანზაქცია უქმდება, ტექსტი ეკრანზე ჩანს). */
export class EmrError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

/** READ COMMITTED: ჩაკეტვის (FOR UPDATE) შემდეგ ყოველი წაკითხვა ბოლო დადასტურებულ მონაცემებს ხედავს. */
export const EMR_TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 };

export function emrFailure(error: unknown): ActionFailure {
  if (error instanceof EmrError) return failure(error.message, error.fieldErrors);
  throw error;
}
