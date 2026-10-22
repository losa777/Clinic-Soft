import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { rolePath } from "@/lib/roles";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "შესვლა" };

// შესულ მომხმარებელს გვერდის რენდერამდე გადავამისამართებთ
export const instant = false;

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect(rolePath(session.user.roleCode));

  return (
    <main className="relative flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <Logo className="text-2xl" />
        <Card className="w-full [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-lg">სისტემაში შესვლა</CardTitle>
            <CardDescription>შეიყვანეთ თქვენი მომხმარებელი და პაროლი</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
