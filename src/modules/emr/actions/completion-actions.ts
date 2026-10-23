"use server";

import { z } from "zod";
import { type ActionResult, invalid, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { completeEncounter } from "@/modules/emr/server/completion";
import { EMR_TX, emrFailure } from "@/modules/emr/server/errors";

const completeSchema = z.object({ encounterId: z.number().int().positive(), version: z.number().int().positive() });

/** ვიზიტის დასრულება (emr.edit) — ერთ ტრანზაქციაში, იხ. completeEncounter. */
export async function completeEncounterAction(input: { encounterId: number; version: number }): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { encounterId, version } = parsed.data;
  const userId = Number(me.id);

  try {
    const message = await prisma.$transaction((tx) => completeEncounter(tx, { encounterId, version, userId }), EMR_TX);
    return success(message);
  } catch (error) {
    return emrFailure(error);
  }
}
