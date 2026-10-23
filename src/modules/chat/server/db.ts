import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** prisma ან ტრანზაქციის კლიენტი. */
export type Db = Prisma.TransactionClient;

/** READ COMMITTED: ჩაკეტვის (FOR UPDATE) შემდეგ წაკითხვა ბოლო დადასტურებულ მონაცემებს ხედავს. */
export function inTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
}

/** $queryRaw-ის მნიშვნელობები: BIGINT/COUNT → bigint, TINYINT(1) → number ან boolean (დრაივერის მიხედვით). */
export const int = (value: unknown) => Number(value ?? 0);
export const bool = (value: unknown) => value === true || Number(value) === 1;
/**
 * LIKE-ის სპეციალური სიმბოლოები (\ % _) ჩვეულებრივ სიმბოლოდ: Prisma-ს `contains` MySQL adapter-ზე მათ არ ახდენს escape-ს
 * („50%“-ის ძებნა „50 ლარი“-საც პოულობდა).
 */
export const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
