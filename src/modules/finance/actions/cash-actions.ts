"use server";

import { type ActionResult, invalid, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { fromTetri } from "@/modules/finance/calc";
import { type CloseShiftInput, closeShiftSchema, type OpenShiftInput, openShiftSchema } from "@/modules/finance/schema";
import { closeShift, openShift } from "@/modules/finance/server/cash";
import { FINANCE_TX, financeFailure } from "@/modules/finance/server/errors";

/** ცვლის გახსნა საწყისი ნაღდით (cash.shift). ერთ მომხმარებელს ერთი ღია ცვლა. */
export async function openShiftAction(input: OpenShiftInput): Promise<ActionResult> {
  const me = await requirePermission("cash.shift");
  const parsed = openShiftSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await openShift(Number(me.id), parsed.data.openingCash);
    return success("ცვლა გაიხსნა");
  } catch (error) {
    return financeFailure(error);
  }
}

/** ცვლის დახურვა: მოსალოდნელი ნაღდი სერვერზე ითვლება, სხვაობა ინახება (სხვაობისას განმარტება სავალდებულოა). */
export async function closeShiftAction(input: CloseShiftInput): Promise<ActionResult> {
  const me = await requirePermission("cash.shift");
  const parsed = closeShiftSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await prisma.$transaction(
      (tx) => closeShift(tx, parsed.data.shiftId, Number(me.id), parsed.data.actualCash, parsed.data.note),
      FINANCE_TX,
    );
    const diff =
      result.difference === 0
        ? "სხვაობა არ არის"
        : `სხვაობა: ${result.difference > 0 ? "+" : ""}${fromTetri(result.difference)} ₾`;
    return success(`ცვლა დაიხურა. ${diff}`);
  } catch (error) {
    return financeFailure(error);
  }
}
