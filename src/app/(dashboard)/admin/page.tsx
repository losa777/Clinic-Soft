import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";

export const instant = false;

export const metadata: Metadata = { title: "ადმინისტრატორი" };

export default async function AdminHome() {
  await requireRole("admin");
  const [total, active, roles] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.role.count(),
  ]);

  const stats = [
    { label: "მომხმარებელი სულ", value: total, icon: Users, href: "/admin/users" },
    { label: "აქტიური", value: active, icon: UserCheck, href: "/admin/users" },
    { label: "გათიშული", value: total - active, icon: UserX, href: "/admin/users" },
    { label: "როლი", value: roles, icon: ShieldCheck, href: "/admin/roles" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="rounded-xl transition-shadow hover:shadow-md">
            <Card className="h-full">
              <CardContent className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums">{value}</p>
                  <p className="truncate text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
