"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { moneySchema } from "@/lib/money";

const serviceFields = {
  // ICD-10 არასავალდებულოა: ცარიელი → null
  code: z
    .string()
    .trim()
    .max(30, "მაქსიმუმ 30 სიმბოლო")
    .regex(/^[\p{L}\p{N}._/-]*$/u, "ICD-10 კოდში დასაშვებია ასოები, ციფრები და . _ / -")
    .transform((v) => v || null),
  name: z.string().trim().min(2, "შეიყვანეთ სერვისის დასახელება").max(255, "მაქსიმუმ 255 სიმბოლო"),
  price: moneySchema("შეიყვანეთ ფასი, მაგ. 25 ან 25.50"),
};

const createSchema = z.object(serviceFields);
const updateSchema = z.object({ ...serviceFields, id: z.number().int().positive() });

export type CreateServiceInput = z.input<typeof createSchema>;
export type UpdateServiceInput = z.input<typeof updateSchema>;

const PATH = "/admin/services";
// უნიკალურია მხოლოდ დასახელება; ერთი ICD-10 კოდი ბევრ სერვისს შეიძლება ჰქონდეს
const NAME_TAKEN = { name: "ამ დასახელებით სერვისი უკვე არსებობს" };

export async function createService(input: CreateServiceInput): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    await prisma.service.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("სერვისი უკვე არსებობს", NAME_TAKEN);
    throw error;
  }
  revalidatePath(PATH);
  return success(`სერვისი „${parsed.data.name}“ დაემატა`);
}

export async function updateService(input: UpdateServiceInput): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;

  try {
    const { count } = await prisma.service.updateMany({ where: { id }, data });
    if (count === 0) return failure("სერვისი ვერ მოიძებნა");
  } catch (error) {
    if (isUniqueViolation(error)) return failure("სერვისი უკვე არსებობს", NAME_TAKEN);
    throw error;
  }
  revalidatePath(PATH);
  return success("ცვლილებები შენახულია");
}

export async function deleteService(id: number): Promise<ActionResult> {
  await requireRole("admin");
  const { count } = await prisma.service.deleteMany({ where: { id } });
  if (count === 0) return failure("სერვისი ვერ მოიძებნა");
  revalidatePath(PATH);
  return success("სერვისი წაიშალა");
}
