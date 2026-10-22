import { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, failure } from "@/lib/action-result";

/** მომხმარებლისთვის განკუთვნილი შეცდომა სერვისის შრიდან (ტრანზაქცია უქმდება, ტექსტი ფორმაში ჩანს). */
export class FinanceError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

/** READ COMMITTED: ჩაკეტვის (FOR UPDATE) შემდეგ ყოველი წაკითხვა ბოლო დადასტურებულ მონაცემებს ხედავს. */
export const FINANCE_TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 };

/** FinanceError → ActionFailure; სხვა შეცდომა ისევ ისვრება (Next.js აჩვენებს/ლოგავს). */
export function financeFailure(error: unknown): ActionFailure {
  if (error instanceof FinanceError) return failure(error.message, error.fieldErrors);
  throw error;
}
