import Link from "next/link";
import { LogOut } from "lucide-react";
import type { Session } from "next-auth";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth-actions";
import { rolePath } from "@/lib/roles";
import { ChatHeaderButton } from "@/modules/chat/components/chat-button";

export function Header({ user }: { user: Session["user"] }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={rolePath(user.roleCode)} className="shrink-0">
          <Logo className="text-lg" />
        </Link>

        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="min-w-0 text-right leading-tight">
            <p className="truncate text-sm font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.roleName}</p>
          </div>
          <ChatHeaderButton />
          <NotificationBell />
          <ThemeToggle />
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
