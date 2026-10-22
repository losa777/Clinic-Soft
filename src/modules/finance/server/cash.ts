import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isUniqueViolation } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { fromTetri, shiftDifference, shiftExpectedCash, toTetri } from "@/modules/finance/calc";
import type { ShiftSummary } from "@/modules/finance/types";
import { type Db, dec, formatDateTime, fullName, int, tetri } from "./db";
import { FinanceError } from "./errors";

/**
 * სალაროს ცვლა: გახსნა (საწყისი ნაღდით), ოპერაციების ჯამი, დახურვა (მოსალოდნელი vs ფაქტობრივი ნაღდი).
 * ერთ მომხმარებელს ერთი ღია ცვლა — ბაზის UNIQUE (open_user_id) იცავს ერთდროული გახსნისგანაც.
 */

export async function openShift(userId: number, openingCash: string) {
  try {
    return await prisma.cashShift.create({
      data: { userId, openingCash: openingCash, openedAt: new Date(), status: "open" },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new FinanceError("თქვენ უკვე გაქვთ გახსნილი ცვლა");
    throw error;
  }
}

/** ცვლის ოპერაციები მეთოდისა და ტიპის მიხედვით — SQL-ში აგრეგაციით (payments.cash_shift_id ინდექსით). */
async function shiftTotals(db: Db, shiftId: number) {
  const rows = await db.$queryRaw<{ type: string; method: string; total: unknown; n: bigint }[]>`
    SELECT type, method, SUM(amount) AS total, COUNT(*) AS n FROM payments WHERE cash_shift_id = ${shiftId} GROUP BY type, method
  `;
  const get = (type: string, method: string) => tetri(rows.find((r) => r.type === type && r.method === method)?.total);
  return {
    cashPayments: get("payment", "cash"),
    cashRefunds: get("refund", "cash"),
    cardPayments: get("payment", "card"),
    cardRefunds: get("refund", "card"),
    operations: rows.reduce((s, r) => s + int(r.n), 0),
  };
}

export async function closeShift(tx: Db, shiftId: number, userId: number, actualCash: string, note: string | null) {
  // ჩაკეტვა: ამასობაში ამ ცვლაზე ნაღდი გადახდა ვეღარ ჩაიწერება (გადახდაც ამავე სტრიქონს კეტავს)
  const rows = await tx.$queryRaw<{ id: number; opening_cash: unknown }[]>`
    SELECT id, opening_cash FROM cash_shifts WHERE id = ${shiftId} AND user_id = ${userId} AND status = 'open' FOR UPDATE
  `;
  if (!rows.length) throw new FinanceError("ღია ცვლა ვერ მოიძებნა — განაახლეთ გვერდი");

  const totals = await shiftTotals(tx, shiftId);
  const expected = shiftExpectedCash(tetri(rows[0].opening_cash), totals.cashPayments, totals.cashRefunds);
  const actual = toTetri(actualCash);
  const difference = shiftDifference(actual, expected);
  if (difference !== 0 && !note) {
    throw new FinanceError("სხვაობის შემთხვევაში მიუთითეთ განმარტება", { note: "მიუთითეთ სხვაობის მიზეზი" });
  }

  await tx.cashShift.update({
    where: { id: shiftId },
    data: {
      status: "closed",
      closedAt: new Date(),
      expectedCash: dec(expected),
      actualCash: dec(actual),
      difference: dec(difference),
      closeNote: note,
    },
  });
  return { expected, actual, difference };
}

const shiftInclude = { user: { select: { firstName: true, lastName: true } } } satisfies Prisma.CashShiftInclude;

async function toSummary(s: Prisma.CashShiftGetPayload<{ include: typeof shiftInclude }>): Promise<ShiftSummary> {
  const totals = await shiftTotals(prisma, s.id);
  const opening = tetri(s.openingCash);
  return {
    id: s.id,
    openedAt: formatDateTime(s.openedAt),
    closedAt: s.closedAt ? formatDateTime(s.closedAt) : null,
    openingCash: s.openingCash.toFixed(2),
    cashPayments: fromTetri(totals.cashPayments),
    cashRefunds: fromTetri(totals.cashRefunds),
    cardPayments: fromTetri(totals.cardPayments),
    cardRefunds: fromTetri(totals.cardRefunds),
    operations: totals.operations,
    expectedCash: s.expectedCash?.toFixed(2) ?? fromTetri(shiftExpectedCash(opening, totals.cashPayments, totals.cashRefunds)),
    actualCash: s.actualCash?.toFixed(2) ?? null,
    difference: s.difference?.toFixed(2) ?? null,
    closeNote: s.closeNote,
    status: s.status,
    cashier: fullName(s.user),
  };
}

export async function loadOpenShift(userId: number): Promise<ShiftSummary | null> {
  const shift = await prisma.cashShift.findFirst({ where: { userId, status: "open" }, include: shiftInclude });
  return shift ? toSummary(shift) : null;
}

/** მომხმარებლის ბოლო დახურული ცვლები. */
export async function loadRecentShifts(userId: number, take = 10): Promise<ShiftSummary[]> {
  const shifts = await prisma.cashShift.findMany({
    where: { userId, status: "closed" },
    include: shiftInclude,
    orderBy: { openedAt: "desc" },
    take,
  });
  return Promise.all(shifts.map(toSummary));
}
