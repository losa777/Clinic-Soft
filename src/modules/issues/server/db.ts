import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type ActionFailure, failure } from "@/lib/action-result";
import { prisma } from "@/lib/db";

/** prisma ან ტრანზაქციის კლიენტი. */
export type Db = Prisma.TransactionClient;

/** მომხმარებლისთვის განკუთვნილი შეცდომა (ტრანზაქცია უქმდება, ტექსტი ფორმაში ჩანს). */
export class IssueError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export function issueFailure(error: unknown): ActionFailure {
  if (error instanceof IssueError) return failure(error.message, error.fieldErrors);
  throw error;
}

export function issueTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { timeout: 15_000 });
}
