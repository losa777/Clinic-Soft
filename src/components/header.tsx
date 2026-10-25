import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import type { Session } from "next-auth";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { RoleSwitcher } from "@/components/role-switcher";
import { Avatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/theme";
import { Button, buttonVariants } from "@/components/ui/button";
import { logout } from "@/lib/auth-actions";
import { rolePath } from "@/lib/roles";
import { ChatHeaderButton } from "@/modules/chat/components/chat-button";
import { ReportIssueButton } from "@/modules/issues/components/report-issue-button";

export function Header({ user }: { user: Session["user"] }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={rolePath(user.roleCode)} className="shrink-0">
          <Logo className="text-lg" />
        </Link>

        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* ფოტო → საკუთარი პროფილი (ფოტოს შეცვლა, პაროლი) */}
            <Link href="/account/profile" className="shrink-0 rounded-full" aria-label="ჩემი პროფილი" title="ჩემი პროფილი">
              <Avatar user={{ id: Number(user.id), firstName: user.firstName, lastName: user.lastName, avatar: user.avatar }} className="size-9 text-sm" />
            </Link>
            <div className="min-w-0 text-right leading-tight">
              <Link href="/account/profile" className="block truncate text-sm font-medium hover:underline">
                {user.firstName} {user.lastName}
              </Link>
              <RoleSwitcher roles={user.roles} active={{ code: user.roleCode, name: user.roleName }} />
            </div>
          </div>
          <ReportIssueButton />
          <ChatHeaderButton />
          <NotificationBell />
          <ThemeToggle />
          <Link href="/account/password" className={buttonVariants({ variant: "ghost", size: "icon-lg" })} aria-label="პაროლის შეცვლა" title="პაროლის შეცვლა">
            <KeyRound />
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline" size="lg" aria-label="გამოსვლა">
              <LogOut />
              <span className="hidden sm:inline">გამოსვლა</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
