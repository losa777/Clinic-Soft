"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { endChatSessions } from "@/modules/chat/realtime/emit";

const name = (label: string) =>
  z.string().trim().min(1, `შეიყვანეთ ${label}`).max(100, `${label} ძალიან გრძელია`);

const userFields = {
  username: z
    .string()
    .trim()
    .min(3, "მინიმუმ 3 სიმბოლო")
    .max(50, "მაქსიმუმ 50 სიმბოლო")
    .regex(/^[a-zA-Z0-9._-]+$/, "მხოლოდ ლათინური ასოები, ციფრები და . _ -"),
  firstName: name("სახელი"),
  lastName: name("გვარი"),
  roleId: z.coerce.number({ error: "აირჩიეთ როლი" }).int().positive("აირჩიეთ როლი"),
  isActive: z.boolean(),
};

const password = z.string().min(8, "პაროლი მინიმუმ 8 სიმბოლო").max(200, "პაროლი ძალიან გრძელია");

const createSchema = z.object({ ...userFields, password });
const updateSchema = z.object({
  ...userFields,
  id: z.number().int().positive(),
  // ცარიელი = პაროლი არ იცვლება
  password: z.union([z.literal(""), password]).optional(),
});

export type CreateUserInput = z.input<typeof createSchema>;
export type UpdateUserInput = z.input<typeof updateSchema>;

const PATH = "/admin/users";
const USERNAME_TAKEN = { username: "ეს მომხმარებელი უკვე არსებობს" };

async function roleExists(roleId: number) {
  return (await prisma.role.count({ where: { id: roleId } })) > 0;
}

/**
 * ადმინისტრატორის დაცვის წესები: საკუთარ თავს ვერ წაშლი/გათიშავ/ადმინობას ვერ ჩამოართმევ,
 * და სისტემაში ერთი აქტიური ადმინი მაინც უნდა დარჩეს.
 */
async function checkAdminSafety(
  currentUserId: number,
  targetId: number,
  after: { removed: true } | { roleId: number; isActive: boolean },
): Promise<string | null> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, include: { role: true } });
  if (!target) return "მომხმარებელი ვერ მოიძებნა";

  const losesAdmin =
    target.role.code === "admin" &&
    target.isActive &&
    ("removed" in after || !after.isActive || after.roleId !== target.roleId);
  if (!losesAdmin) return null;

  if (targetId === currentUserId) {
    if ("removed" in after) return "საკუთარ ანგარიშს ვერ წაშლით";
    if (!after.isActive) return "საკუთარ ანგარიშს ვერ გათიშავთ";
    return "საკუთარ თავს ადმინისტრატორის როლს ვერ ჩამოართმევთ";
  }

  const otherAdmins = await prisma.user.count({
    where: { isActive: true, role: { code: "admin" }, id: { not: targetId } },
  });
  return otherAdmins === 0 ? "სისტემაში უნდა დარჩეს ერთი აქტიური ადმინისტრატორი მაინც" : null;
}

export async function createUser(input: CreateUserInput): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { password, ...data } = parsed.data;

  if (!(await roleExists(data.roleId))) return failure("როლი ვერ მოიძებნა", { roleId: "აირჩიეთ როლი" });

  try {
    await prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) } });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("მომხმარებელი უკვე არსებობს", USERNAME_TAKEN);
    throw error;
  }
  revalidatePath(PATH);
  return success(`მომხმარებელი „${data.username}“ დაემატა`);
}

export async function updateUser(input: UpdateUserInput): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, password, ...data } = parsed.data;

  if (!(await roleExists(data.roleId))) return failure("როლი ვერ მოიძებნა", { roleId: "აირჩიეთ როლი" });
  const blocked = await checkAdminSafety(Number(me.id), id, data);
  if (blocked) return failure(blocked);

  try {
    await prisma.user.update({
      where: { id },
      data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("მომხმარებელი უკვე არსებობს", USERNAME_TAKEN);
    throw error;
  }
  // გათიშულს ჩატის კავშირი მაშინვე უწყდება (სხვა გვერდებზე — შემდეგ მოთხოვნაზე, auth.ts)
  if (!data.isActive) endChatSessions(id, "deactivated");
  revalidatePath(PATH);
  return success("ცვლილებები შენახულია");
}

export async function setUserActive(id: number, isActive: boolean): Promise<ActionResult> {
  const me = await requireRole("admin");
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return failure("მომხმარებელი ვერ მოიძებნა");

  const blocked = await checkAdminSafety(Number(me.id), id, { roleId: target.roleId, isActive });
  if (blocked) return failure(blocked);

  await prisma.user.update({ where: { id }, data: { isActive } });
  if (!isActive) endChatSessions(id, "deactivated");
  revalidatePath(PATH);
  return success(isActive ? "მომხმარებელი გააქტიურდა" : "მომხმარებელი გაითიშა");
}

export async function deleteUser(id: number): Promise<ActionResult> {
  const me = await requireRole("admin");
  const blocked = await checkAdminSafety(Number(me.id), id, { removed: true });
  if (blocked) return failure(blocked);
  if (id === Number(me.id)) return failure("საკუთარ ანგარიშს ვერ წაშლით");

  try {
    await prisma.user.delete({ where: { id } });
  } catch (error) {
    // მომხმარებელს ჩანაწერები აქვს (მაგ. ჩატის შეტყობინებები — ისინი არ იშლება): წაშლის ნაცვლად — გათიშვა
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return failure("მომხმარებელს სისტემაში ჩანაწერები აქვს (მაგ. ჩატის შეტყობინებები) — წაშლის ნაცვლად გათიშეთ");
    }
    throw error;
  }
  endChatSessions(id, "deactivated");
  revalidatePath(PATH);
  return success("მომხმარებელი წაიშალა");
}
