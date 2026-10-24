"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";

const name = z.string().trim().min(2, "შეიყვანეთ სპეციალობის დასახელება").max(100, "მაქსიმუმ 100 სიმბოლო");

const createSchema = z.object({ name });
const updateSchema = z.object({ name, id: z.number().int().positive() });

export type CreateSpecialtyInput = z.input<typeof createSchema>;
export type UpdateSpecialtyInput = z.input<typeof updateSchema>;

const PATH = "/admin/specialties";
const NAME_TAKEN = { name: "ეს სპეციალობა უკვე არსებობს" };

export async function createSpecialty(input: CreateSpecialtyInput): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    await prisma.specialty.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("სპეციალობა უკვე არსებობს", NAME_TAKEN);
    throw error;
  }
  revalidatePath(PATH);
  return success(`სპეციალობა „${parsed.data.name}“ დაემატა`);
}

export async function updateSpecialty(input: UpdateSpecialtyInput): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;

  try {
    const { count } = await prisma.specialty.updateMany({ where: { id }, data });
    if (count === 0) return failure("სპეციალობა ვერ მოიძებნა");
  } catch (error) {
    if (isUniqueViolation(error)) return failure("სპეციალობა უკვე არსებობს", NAME_TAKEN);
    throw error;
  }
  revalidatePath(PATH);
  return success("ცვლილებები შენახულია");
}

/** წაიშლება მხოლოდ სპეციალობა, რომელიც არცერთ ექიმს არ აქვს (გათიშულსაც). */
export async function deleteSpecialty(id: number): Promise<ActionResult> {
  await requireRole("admin");
  const doctors = await prisma.doctor.count({ where: { specialtyId: id } });
  if (doctors > 0) return failure(`სპეციალობა ${doctors} ექიმს აქვს მინიჭებული — ჯერ ექიმებს შეუცვალეთ სპეციალობა`);

  const { count } = await prisma.specialty.deleteMany({ where: { id } });
  if (count === 0) return failure("სპეციალობა ვერ მოიძებნა");
  revalidatePath(PATH);
  return success("სპეციალობა წაიშალა");
}
