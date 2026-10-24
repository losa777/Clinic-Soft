import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { lockedUsernames } from "@/lib/login-guard";
import { formatTime } from "@/lib/appointment-slots";
import { type RoleOption, type UserRow, UsersTable } from "./users-table";

export const instant = false;

export const metadata: Metadata = { title: "მომხმარებლები" };

const dateFormat = new Intl.DateTimeFormat("ka-GE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function UsersPage() {
  const me = await requireRole("admin");
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarVersion: true,
        isActive: true,
        createdAt: true,
        role: { select: { id: true, code: true, name: true } },
        extraRoles: { select: { role: { select: { id: true, name: true } } }, orderBy: { roleId: "asc" } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.role.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);

  const locks = await lockedUsernames(users.map((u) => u.username));
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatarVersion,
    isActive: u.isActive,
    lockedUntil: locks.has(u.username.toLowerCase()) ? formatTime(locks.get(u.username.toLowerCase())!) : null,
    roleId: u.role.id,
    roleName: u.role.name,
    extraRoles: u.extraRoles.map((r) => ({ id: r.role.id, name: r.role.name })),
    createdAt: u.createdAt.getTime(),
    createdAtLabel: dateFormat.format(u.createdAt),
  }));
  const roleOptions: RoleOption[] = roles.map((r) => ({ value: String(r.id), label: r.name }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">მომხმარებლები</h1>
        <p className="text-sm text-muted-foreground">სისტემის მომხმარებლების დამატება, რედაქტირება და გათიშვა</p>
      </div>
      <UsersTable data={rows} roles={roleOptions} currentUserId={Number(me.id)} />
    </section>
  );
}
