"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { RESERVED_ROLE_CODES, ROLE_CODE_PATTERN, isSystemRole } from "@/lib/roles";

const roleName = z.string().trim().min(2, "შეიყვანეთ როლის სახელი").max(50, "მაქსიმუმ 50 სიმბოლო");

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(ROLE_CODE_PATTERN, "2–30 სიმბოლო: ლათინური პატარა ასოები, ციფრები, ტირე; იწყება ასოთი")
    .refine((c) => !RESERVED_ROLE_CODES.includes(c), "ეს კოდი სისტემისთვისაა დაჯავშნილი"),
  name: roleName,
});

const updateSchema = z.object({ id: z.number().int().positive(), name: roleName });

export type CreateRoleInput = z.input<typeof createSchema>;
export type UpdateRoleInput = z.input<typeof updateSchema>;

const PATH = "/admin/roles";

export async function createRole(input: CreateRoleInput): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    await prisma.role.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("როლი ამ კოდით უკვე არსებობს", { code: "ეს კოდი უკვე გამოყენებულია" });
    throw error;
  }
  revalidatePath(PATH);
  return success(`როლი „${parsed.data.name}“ დაემატა`);
}

/** მხოლოდ სახელი იცვლება — კოდი URL-ებშია და შექმნის შემდეგ ფიქსირებულია. */
export async function updateRole(input: UpdateRoleInput): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { count } = await prisma.role.updateMany({ where: { id: parsed.data.id }, data: { name: parsed.data.name } });
  if (count === 0) return failure("როლი ვერ მოიძებნა");
  revalidatePath(PATH);
  return success("როლის სახელი შეიცვალა");
}

export async function deleteRole(id: number): Promise<ActionResult> {
  await requireRole("admin");
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return failure("როლი ვერ მოიძებნა");
  if (isSystemRole(role.code)) return failure("სისტემური როლის წაშლა შეუძლებელია");
  if (role._count.users > 0) {
    return failure(`როლს ჰყავს ${role._count.users} მომხმარებელი — ჯერ გადაიყვანეთ ისინი სხვა როლზე`);
  }

  await prisma.role.delete({ where: { id } });
  revalidatePath(PATH);
  return success("როლი წაიშალა");
}
