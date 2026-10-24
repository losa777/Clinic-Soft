import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { AvatarEditor } from "@/components/avatar-editor";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/dal";

export const instant = false;

export const metadata: Metadata = { title: "ჩემი პროფილი" };

/** საკუთარი პროფილი: ფოტო და პაროლის შეცვლის ბმული — ყველა როლისთვის (/account — საერთო განყოფილება). */
export default async function ProfilePage() {
  const me = await requireUser();
  return (
    <section className="flex flex-col items-center gap-4 py-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {me.firstName} {me.lastName}
          </CardTitle>
          <CardDescription>{me.roles.map((r) => r.name).join(", ")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvatarEditor user={{ id: Number(me.id), firstName: me.firstName, lastName: me.lastName, avatar: me.avatar }} />
          <Link href="/account/password" className={buttonVariants({ variant: "outline", className: "w-fit" })}>
            <KeyRound />
            პაროლის შეცვლა
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
