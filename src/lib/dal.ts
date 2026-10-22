import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { can, type PermissionCode } from "@/lib/permissions";
import { rolePath } from "@/lib/roles";

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

/** მომხმარებელი მოცემული როლით; სხვა როლი თავის გვერდზე გადადის. */
export async function requireRole(roleCode: string) {
  return requireAnyRole(roleCode);
}

/** მომხმარებელი ერთ-ერთი როლით (Server Actions-ისთვის, რომლებიც რამდენიმე როლს ეკუთვნის). */
export async function requireAnyRole(...roleCodes: string[]) {
  const user = await requireUser();
  if (!roleCodes.includes(user.roleCode)) redirect(rolePath(user.roleCode));
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
