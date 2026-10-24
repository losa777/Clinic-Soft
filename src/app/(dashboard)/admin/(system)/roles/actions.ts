"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { ALL_PERMISSIONS, FULL_ACCESS_ROLE, isPermission } from "@/lib/permissions";
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
  const me = await requireRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const role = await prisma.role.create({ data: parsed.data });
    await audit({ userId: Number(me.id), action: "create", entity: "role", entityId: role.id, details: `${role.code} · ${role.name}` });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("როლი ამ კოდით უკვე არსებობს", { code: "ეს კოდი უკვე გამოყენებულია" });
    throw error;
  }
  revalidatePath(PATH);
  return success(`როლი „${parsed.data.name}“ დაემატა`);
}

/** მხოლოდ სახელი იცვლება — კოდი URL-ებშია და შექმნის შემდეგ ფიქსირებულია. */
export async function updateRole(input: UpdateRoleInput): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { count } = await prisma.role.updateMany({ where: { id: parsed.data.id }, data: { name: parsed.data.name } });
  if (count === 0) return failure("როლი ვერ მოიძებნა");
  await audit({ userId: Number(me.id), action: "update", entity: "role", entityId: parsed.data.id, details: `სახელი: ${parsed.data.name}` });
  revalidatePath(PATH);
  return success("როლის სახელი შეიცვალა");
}

const permissionsSchema = z.object({
  roleId: z.number().int().positive(),
  codes: z.array(z.string().refine(isPermission, "უცნობი უფლება")).max(ALL_PERMISSIONS.length),
});

/**
 * როლის უფლებები (მთლიანად იცვლება). ადმინისტრატორის როლს ყოველთვის ყველა უფლება აქვს — მისი შეცვლა არ შეიძლება.
 * ცვლილება მაშინვე მოქმედებს: სესია უფლებებს ყოველ მოთხოვნაზე ბაზიდან კითხულობს.
 */
export async function setRolePermissions(input: z.input<typeof permissionsSchema>): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = permissionsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { roleId, codes } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return failure("როლი ვერ მოიძებნა");
  if (role.code === FULL_ACCESS_ROLE) return failure("ადმინისტრატორს ყველა უფლება აქვს — შეცვლა შეუძლებელია");

  const permissions = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const before = (await prisma.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { code: true } } } })).map((p) => p.permission.code);
  const added = permissions.map((p) => p.code).filter((c) => !before.includes(c));
  const removed = before.filter((c) => !(codes as string[]).includes(c));
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId, permissionId: p.id })) });
    const details = [role.name, added.length && `+ ${added.join(", ")}`, removed.length && `− ${removed.join(", ")}`].filter(Boolean).join(" · ");
    await audit({ userId: Number(me.id), action: "permissions", entity: "role", entityId: roleId, details }, tx);
  });
  revalidatePath(PATH);
  return success(`„${role.name}“: უფლებები შენახულია (${permissions.length})`);
}

export async function deleteRole(id: number): Promise<ActionResult> {
  const me = await requireRole("admin");
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true, extraUsers: true } } } });
  if (!role) return failure("როლი ვერ მოიძებნა");
  if (isSystemRole(role.code)) return failure("სისტემური როლის წაშლა შეუძლებელია");
  const userCount = role._count.users + role._count.extraUsers;
  if (userCount > 0) {
    return failure(`როლს ჰყავს ${userCount} მომხმარებელი (მთავარი ან დამატებითი როლით) — ჯერ მოხსენით ან გადაიყვანეთ სხვა როლზე`);
  }

  await prisma.role.delete({ where: { id } });
  await audit({ userId: Number(me.id), action: "delete", entity: "role", entityId: id, details: `${role.code} · ${role.name}` });
  revalidatePath(PATH);
  return success("როლი წაიშალა");
}
