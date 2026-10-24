import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { can, type PermissionCode } from "@/lib/permissions";
import { hasRole, rolePath } from "@/lib/roles";

/** მიმდინარე სესია — ერთი მოთხოვნის ფარგლებში ერთხელ იკითხება. */
export const getSession = cache(async () => {
  // სესია ყოველთვის მოთხოვნის დროს იკითხება (Auth.js შიგნით crypto-ს იყენებს)
  await connection();
  return auth();
});

/** შესული მომხმარებელი, ან გადამისამართება /login-ზე. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user;
}

/**
 * ამ მოთხოვნის როლი: requireRole-ით გახსნილი განყოფილება (აუდიტისთვის — src/lib/audit.ts).
 * სესიის roleCode მოთხოვნის დასაწყისის მდგომარეობაა, როლის გადართვისას კი ეს უკვე ახალია.
 */
export const requestRole = cache((): { code: string | null } => ({ code: null }));

/** ბოლოს არჩეული როლი ინახება — შემდეგ შესვლაზე აქ გაიხსნება. ერთ მოთხოვნაში ერთხელ. */
const rememberRole = cache(async (userId: number, code: string) => {
  const role = await prisma.role.findUnique({ where: { code }, select: { id: true } });
  if (role) await prisma.user.update({ where: { id: userId }, data: { activeRoleId: role.id } });
});

/**
 * მომხმარებელი მოცემული როლით (მთავარი ან დამატებითი); სხვა როლი თავის გვერდზე გადადის.
 * რამდენიმე როლის მომხმარებელს ეს როლი აქტიური ხდება (ზედა პანელი, აუდიტი, შემდეგი შესვლა).
 */
export async function requireRole(roleCode: string) {
  const user = await requireAnyRole(roleCode);
  requestRole().code = roleCode;
  if (user.roleCode === roleCode) return user;
  await rememberRole(Number(user.id), roleCode);
  const role = user.roles.find((r) => r.code === roleCode);
  return { ...user, roleCode, roleName: role?.name ?? user.roleName };
}

/** მომხმარებელი ერთ-ერთი როლით (Server Actions-ისთვის, რომლებიც რამდენიმე როლს ეკუთვნის). */
export async function requireAnyRole(...roleCodes: string[]) {
  const user = await requireUser();
  if (!hasRole(user, ...roleCodes)) redirect(rolePath(user.roleCode));
  return user;
}

/**
 * მომხმარებელი ყველა მითითებული უფლებით (src/lib/permissions.ts); უფლება არ აქვს — საკუთარ გვერდზე გადადის.
 * უფლებები სესიაში ყოველ მოთხოვნაზე ბაზიდან იკითხება (auth.ts), ამიტომ ცვლილება მაშინვე მოქმედებს.
 */
export async function requirePermission(...codes: PermissionCode[]) {
  const user = await requireUser();
  if (!codes.every((code) => can(user, code))) redirect(rolePath(user.roleCode));
  return user;
}

/** მომხმარებელი ერთ-ერთი უფლებით მაინც. */
export async function requireAnyPermission(...codes: PermissionCode[]) {
  const user = await requireUser();
  if (!codes.some((code) => can(user, code))) redirect(rolePath(user.roleCode));
  return user;
}
