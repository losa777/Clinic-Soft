import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/modules/finance/server/db";
import { PasswordForm } from "./password-form";

export const instant = false;

export const metadata: Metadata = { title: "პაროლის შეცვლა" };

/** საკუთარი პაროლის შეცვლა — ყველა როლისთვის (/account — საერთო განყოფილება, src/lib/route-access.ts). */
export default async function PasswordPage() {
  const me = await requireUser();
  const user = await prisma.user.findUnique({ where: { id: Number(me.id) }, select: { username: true, passwordChangedAt: true } });
  return (
    <section className="flex flex-col items-center gap-4 py-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>პაროლის შეცვლა</CardTitle>
          <CardDescription>
            მომხმარებელი: <span className="font-mono">{user?.username}</span>
            {user?.passwordChangedAt && <> · ბოლოს შეიცვალა {formatDateTime(user.passwordChangedAt)}</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm username={user?.username ?? ""} />
        </CardContent>
      </Card>
    </section>
  );
}
