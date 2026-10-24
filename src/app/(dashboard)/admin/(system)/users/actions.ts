"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { signOut } from "@/auth";
import { audit } from "@/lib/audit";
import { unlockUsername } from "@/lib/login-guard";
import { passwordSchema } from "@/lib/password-policy";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { recordHasRole, userWithRole } from "@/lib/user-roles";
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
  // დამატებითი როლები (მაგ. რეგისტრატორი + საწყობის მენეჯერი); მთავარი როლი აქ არ მეორდება
  extraRoleIds: z.array(z.number().int().positive()).max(20).default([]),
  isActive: z.boolean(),
};

// იგივე წესი, რაც საკუთარი პაროლის შეცვლისას (src/lib/password-policy.ts)
const password = passwordSchema;

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

/** მთავარი + დამატებითი როლები (დუბლიკატების გარეშე); null — რომელიმე როლი ვერ მოიძებნა. */
async function resolveRoles(roleId: number, extraRoleIds: number[]) {
  const extra = [...new Set(extraRoleIds)].filter((id) => id !== roleId);
  const found = await prisma.role.findMany({ where: { id: { in: [roleId, ...extra] } }, select: { id: true } });
  return found.length === extra.length + 1 ? { roleId, extra } : null;
}

const ROLE_NOT_FOUND = failure("როლი ვერ მოიძებნა", { roleId: "აირჩიეთ როლი" });

/** მომხმარებლის ყველა როლის სახელი (მთავარი პირველი) — აუდიტისთვის. */
async function roleNames(userId: number): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: { select: { name: true } }, extraRoles: { select: { role: { select: { name: true } } }, orderBy: { roleId: "asc" } } },
  });
  return u ? [u.role.name, ...u.extraRoles.map((r) => r.role.name)].join(", ") : "";
}

/**
 * ადმინისტრატორის დაცვის წესები: საკუთარ თავს ვერ წაშლი/გათიშავ/ადმინობას ვერ ჩამოართმევ,
 * და სისტემაში ერთი აქტიური ადმინი მაინც უნდა დარჩეს.
 */
async function checkAdminSafety(
  currentUserId: number,
  targetId: number,
  after: { removed: true } | { roleIds: number[]; isActive: boolean },
): Promise<string | null> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { role: true, extraRoles: { select: { role: { select: { code: true } } } } },
  });
  if (!target) return "მომხმარებელი ვერ მოიძებნა";

  // ადმინობა — მთავარი ან დამატებითი როლით
  const adminRole = await prisma.role.findUnique({ where: { code: "admin" }, select: { id: true } });
  const losesAdmin =
    recordHasRole(target, "admin") &&
    target.isActive &&
    ("removed" in after || !after.isActive || !after.roleIds.includes(adminRole?.id ?? -1));
  if (!losesAdmin) return null;

  if (targetId === currentUserId) {
    if ("removed" in after) return "საკუთარ ანგარიშს ვერ წაშლით";
    if (!after.isActive) return "საკუთარ ანგარიშს ვერ გათიშავთ";
    return "საკუთარ თავს ადმინისტრატორის როლს ვერ ჩამოართმევთ";
  }

  const otherAdmins = await prisma.user.count({
    where: { isActive: true, ...userWithRole({ code: "admin" }), id: { not: targetId } },
  });
  return otherAdmins === 0 ? "სისტემაში უნდა დარჩეს ერთი აქტიური ადმინისტრატორი მაინც" : null;
}

export async function createUser(input: CreateUserInput): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { password, extraRoleIds, ...data } = parsed.data;

  const roles = await resolveRoles(data.roleId, extraRoleIds);
  if (!roles) return ROLE_NOT_FOUND;

  try {
    const created = await prisma.user.create({
      data: { ...data, passwordHash: await bcrypt.hash(password, 12), extraRoles: { create: roles.extra.map((roleId) => ({ roleId })) } },
    });
    await audit({ userId: Number(me.id), action: "create", entity: "user", entityId: created.id, details: `${created.username} · ${await roleNames(created.id)}` });
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
  const { id, password, extraRoleIds, ...data } = parsed.data;

  const roles = await resolveRoles(data.roleId, extraRoleIds);
  if (!roles) return ROLE_NOT_FOUND;
  const blocked = await checkAdminSafety(Number(me.id), id, { roleIds: [roles.roleId, ...roles.extra], isActive: data.isActive });
  if (blocked) return failure(blocked);

  const before = await prisma.user.findUnique({ where: { id } });
  const rolesBefore = await roleNames(id);
  try {
    const after = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.extra.map((roleId) => ({ userId: id, roleId })) });
      return tx.user.update({
        where: { id },
        // ახალი პაროლი: მომხმარებლის ყველა სესია წყდება (session_version) — შედის ახალი პაროლით
        data: {
          ...data,
          ...(password ? { passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 }, passwordChangedAt: new Date() } : {}),
        },
      });
    });
    const rolesAfter = await roleNames(id);
    // რა შეიცვალა (პაროლი — მხოლოდ ფაქტი, მნიშვნელობის გარეშე)
    const changes = [
      before && before.username !== after.username && `მომხმარებელი: ${before.username} → ${after.username}`,
      before && (before.firstName !== after.firstName || before.lastName !== after.lastName) && `სახელი: ${after.firstName} ${after.lastName}`,
      rolesBefore !== rolesAfter && `როლები: ${rolesBefore} → ${rolesAfter}`,
      before && before.isActive !== after.isActive && (after.isActive ? "გააქტიურდა" : "გაითიშა"),
      password && "პაროლი შეიცვალა",
    ].filter(Boolean);
    await audit({ userId: Number(me.id), action: "update", entity: "user", entityId: id, details: `${after.username}${changes.length ? `: ${changes.join("; ")}` : ""}` });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("მომხმარებელი უკვე არსებობს", USERNAME_TAKEN);
    throw error;
  }
  // გათიშულს ჩატის კავშირი მაშინვე უწყდება (სხვა გვერდებზე — შემდეგ მოთხოვნაზე, auth.ts)
  if (!data.isActive) endChatSessions(id, "deactivated");
  else if (password) endChatSessions(id, "logout");
  // საკუთარი პაროლი — ამ სესიასაც ახალი პაროლით შესვლა სჭირდება
  if (password && id === Number(me.id)) await signOut({ redirectTo: "/login?changed=1" });
  revalidatePath(PATH);
  return success("ცვლილებები შენახულია");
}

export async function setUserActive(id: number, isActive: boolean): Promise<ActionResult> {
  const me = await requireRole("admin");
  const target = await prisma.user.findUnique({ where: { id }, include: { extraRoles: { select: { roleId: true } } } });
  if (!target) return failure("მომხმარებელი ვერ მოიძებნა");

  const roleIds = [target.roleId, ...target.extraRoles.map((r) => r.roleId)];
  const blocked = await checkAdminSafety(Number(me.id), id, { roleIds, isActive });
  if (blocked) return failure(blocked);

  await prisma.user.update({ where: { id }, data: { isActive } });
  await audit({ userId: Number(me.id), action: isActive ? "activate" : "deactivate", entity: "user", entityId: id, details: target.username });
  if (!isActive) endChatSessions(id, "deactivated");
  revalidatePath(PATH);
  return success(isActive ? "მომხმარებელი გააქტიურდა" : "მომხმარებელი გაითიშა");
}

export async function deleteUser(id: number): Promise<ActionResult> {
  const me = await requireRole("admin");
  const blocked = await checkAdminSafety(Number(me.id), id, { removed: true });
  if (blocked) return failure(blocked);
  if (id === Number(me.id)) return failure("საკუთარ ანგარიშს ვერ წაშლით");

  const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
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
  await audit({ userId: Number(me.id), action: "delete", entity: "user", entityId: id, details: target?.username ?? null });
  revalidatePath(PATH);
  return success("მომხმარებელი წაიშალა");
}

/** შესვლის განბლოკვა (ზედიზედ წარუმატებელი ცდების შემდეგ) — ათვლა თავიდან იწყება. */
export async function unlockUser(id: number): Promise<ActionResult> {
  const me = await requireRole("admin");
  const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  if (!target) return failure("მომხმარებელი ვერ მოიძებნა");
  await unlockUsername(target.username);
  await audit({ userId: Number(me.id), action: "unlock", entity: "user", entityId: id, details: target.username });
  revalidatePath(PATH);
  return success(`„${target.username}“ განიბლოკა`);
}
