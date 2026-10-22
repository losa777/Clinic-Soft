"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, invalid, success } from "@/lib/action-result";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SETTING_KEYS, SETTING_LABELS } from "@/modules/finance/settings";

const settingsSchema = z.object(
  Object.fromEntries(
    SETTING_KEYS.map((k) => [k, z.string().trim().max(500, `${SETTING_LABELS[k]}: მაქსიმუმ 500 სიმბოლო`)]),
  ) as Record<(typeof SETTING_KEYS)[number], z.ZodString>,
).refine((v) => v.clinic_name.length > 0, { path: ["clinic_name"], message: "შეიყვანეთ კლინიკის დასახელება" });

/** კლინიკის რეკვიზიტები (ქვითრისთვის) — მხოლოდ ადმინისტრატორი. */
export async function saveSettingsAction(input: Record<string, string>): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await prisma.$transaction(
    Object.entries(parsed.data).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
  revalidatePath("/admin/settings");
  return success("პარამეტრები შენახულია");
}
