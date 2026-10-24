import type { Prisma } from "@/generated/prisma/client";

/**
 * რამდენიმე როლი ერთ მომხმარებელს: users.role_id — მთავარი, user_roles — დამატებითი.
 * როლით მომხმარებლების ძებნა ორივეს უნდა ამოწმებდეს (მაგ. ექიმები, საწყობის მმართველები, ადმინები).
 */
export function userWithRole(role: Prisma.RoleWhereInput): Prisma.UserWhereInput {
  return { OR: [{ role }, { extraRoles: { some: { role } } }] };
}

/** ბაზის ჩანაწერს (role + extraRoles) ეს როლი აქვს — მთავარი ან დამატებითი. */
export function recordHasRole(u: { role: { code: string }; extraRoles: { role: { code: string } }[] }, code: string): boolean {
  return u.role.code === code || u.extraRoles.some((r) => r.role.code === code);
}
