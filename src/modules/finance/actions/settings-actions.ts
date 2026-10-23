"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { tbilisiToday } from "@/lib/appointment-slots";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { detectMimeType, removeDocuments, storeDocument } from "@/lib/document-storage";
import { NO_YEAR } from "@/modules/finance/server/numbering";
import { loadStampPath } from "@/modules/finance/server/stamp";
import { SETTING_KEYS, SETTING_LABELS, STAMP_SETTING_KEY } from "@/modules/finance/settings";

const settingsSchema = z.object(
  Object.fromEntries(
    SETTING_KEYS.map((k) => [k, z.string().trim().max(500, `${SETTING_LABELS[k]}: მაქსიმუმ 500 სიმბოლო`)]),
  ) as Record<(typeof SETTING_KEYS)[number], z.ZodString>,
).refine((v) => v.clinic_name.length > 0, { path: ["clinic_name"], message: "შეიყვანეთ კლინიკის დასახელება" });

/** კლინიკის რეკვიზიტები (ქვითრისა და დოკუმენტებისთვის) — მხოლოდ ადმინისტრატორი. */
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

const MAX_STAMP_SIZE = 1024 * 1024;

/** ბეჭდის სურათის ატვირთვა (PNG — სასურველია გამჭვირვალე ფონით, ან JPG; ≤ 1 MB). ძველი ფაილი იშლება. */
export async function uploadStampAction(formData: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failure("აირჩიეთ ფაილი");
  if (file.size > MAX_STAMP_SIZE) return failure("ფაილი 1 MB-ზე დიდია");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectMimeType(bytes);
  if (mime !== "image/png" && mime !== "image/jpeg") return failure("დასაშვებია მხოლოდ PNG ან JPG");
  const path = await storeDocument(bytes, mime);
  const old = await loadStampPath();
  try {
    await prisma.setting.upsert({ where: { key: STAMP_SETTING_KEY }, create: { key: STAMP_SETTING_KEY, value: path }, update: { value: path } });
  } catch (error) {
    await removeDocuments([path]);
    throw error;
  }
  if (old) await removeDocuments([old]);
  revalidatePath("/admin/settings");
  return success("ბეჭედი აიტვირთა");
}

export async function removeStampAction(): Promise<ActionResult> {
  await requireRole("admin");
  const old = await loadStampPath();
  await prisma.setting.deleteMany({ where: { key: STAMP_SETTING_KEY } });
  if (old) await removeDocuments([old]);
  revalidatePath("/admin/settings");
  return success("ბეჭედი წაიშალა");
}

const numberingSchema = z.object({
  form100Last: z.number({ error: "შეიყვანეთ რიცხვი" }).int("მთელი რიცხვი").min(0, "0 ან მეტი").max(99_999_999),
  cardLast: z.number({ error: "შეიყვანეთ რიცხვი" }).int("მთელი რიცხვი").min(0, "0 ან მეტი").max(99_999_999),
});

/**
 * ნუმერაციის გაგრძელება (ძველი სისტემიდან გადმოსვლისას): ბოლო გაცემული ფორმა 100-ის ნომერი და მიმდინარე წლის
 * ბოლო სამედიცინო ბარათის ნომერი. შემდეგი იქნება +1.
 */
export async function saveNumberingAction(input: z.input<typeof numberingSchema>): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = numberingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const year = Number(tbilisiToday().slice(0, 4));
  await prisma.$transaction([
    prisma.$executeRaw`INSERT INTO number_sequences (name, year, last_value) VALUES ('F100', ${NO_YEAR}, ${parsed.data.form100Last})
      ON DUPLICATE KEY UPDATE last_value = VALUES(last_value)`,
    prisma.$executeRaw`INSERT INTO number_sequences (name, year, last_value) VALUES ('CARD', ${year}, ${parsed.data.cardLast})
      ON DUPLICATE KEY UPDATE last_value = VALUES(last_value)`,
  ]);
  revalidatePath("/admin/settings");
  return success("ნუმერაცია შენახულია");
}
