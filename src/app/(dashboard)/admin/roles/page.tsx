import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { isSystemRole } from "@/lib/roles";
import { type RoleRow, RolesTable } from "./roles-table";

export const instant = false;

export const metadata: Metadata = { title: "როლები" };

export default async function RolesPage() {
  await requireRole("admin");
  const roles = await prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { id: "asc" },
  });

  const rows: RoleRow[] = roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    userCount: r._count.users,
    isSystem: isSystemRole(r.code),
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">როლები</h1>
        <p className="text-sm text-muted-foreground">
          სისტემური როლების წაშლა შეუძლებელია. როლის კოდი გამოიყენება მისამართში და შექმნის შემდეგ არ იცვლება.
        </p>
      </div>
      <RolesTable data={rows} />
    </section>
  );
}
