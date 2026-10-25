"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  CheckCheck,
  FlaskConical,
  PackageX,
  Syringe,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { startNavigationProgress } from "@/components/navigation-progress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationsReadAction } from "@/lib/notification-actions";
import type { NotificationItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";

/** რამდენ ხანში ერთხელ მოწმდება ახალი შეტყობინებები (ფანჯარა თუ ფონზეა — არ მოწმდება). */
const POLL_MS = 30_000;

const ICONS: Record<string, typeof Bell> = {
  patient_arrived: UserRound,
  lab_ready: FlaskConical,
  procedure_done: Syringe,
  inventory_low: PackageX,
  inventory_expiry: CalendarClock,
  issue_new: TriangleAlert,
  issue_update: TriangleAlert,
};

/**
 * შეტყობინებების ზარი: polling (/api/notifications), წაუკითხავების რიცხვი, ახალზე — toast.
 * დაჭერისას: წაკითხულად მოინიშნება და ბმულზე გადადის.
 */
export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<{
    unread: number;
    items: NotificationItem[];
  } | null>(null);
  const lastSeenId = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as {
        unread: number;
        items: NotificationItem[];
      };
      // ახალი (ბოლო შემოწმების შემდეგ) წაუკითხავი — toast; პირველ ჩატვირთვაზე არა
      const newest = next.items[0]?.id ?? 0;
      if (lastSeenId.current !== null) {
        for (const n of next.items
          .filter((i) => i.id > lastSeenId.current! && !i.read)
          .slice(0, 3)
          .reverse()) {
          toast.info(n.title, { description: n.body ?? undefined });
        }
      }
      lastSeenId.current = Math.max(lastSeenId.current ?? 0, newest);
      setData(next);
    } catch {
      // ქსელის შეცდომა — შემდეგ ციკლზე ისევ ვცდით
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      void load();
      timer = setInterval(load, POLL_MS);
    };
    const onVisibility = () =>
      document.visibilityState === "visible" ? start() : clearInterval(timer);
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  async function markRead(ids: number[] | "all") {
    setData(
      (d) =>
        d && {
          unread:
            ids === "all"
              ? 0
              : Math.max(
                  0,
                  d.unread -
                    d.items.filter((i) => ids.includes(i.id) && !i.read).length,
                ),
          items: d.items.map((i) =>
            ids === "all" || ids.includes(i.id) ? { ...i, read: true } : i,
          ),
        },
    );
    await markNotificationsReadAction(ids).catch(() => null);
  }

  const unread = data?.unread ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon-lg"
            className="relative"
            aria-label={
              unread ? `შეტყობინებები: ${unread} წაუკითხავი` : "შეტყობინებები"
            }
            title="შეტყობინებები"
          />
        }
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* Base UI: GroupLabel მხოლოდ Group-ის შიგნით */}
        <DropdownMenuGroup>
          <div className="flex items-center justify-between gap-2 pr-1.5">
            <DropdownMenuLabel>შეტყობინებები</DropdownMenuLabel>
            {unread > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => markRead("all")}
              >
                <CheckCheck className="size-3.5" />
                ყველა წაკითხულია
              </button>
            )}
          </div>
          <DropdownMenuSeparator />
          {!data?.items.length ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              შეტყობინება არ არის
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {data.items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <DropdownMenuItem
                    key={n.id}
                    className={cn(
                      "items-start gap-2 py-2",
                      !n.read && "bg-primary/5",
                    )}
                    onClick={() => {
                      if (!n.read) void markRead([n.id]);
                      if (n.link) {
                        startNavigationProgress();
                        router.push(n.link);
                      }
                    }}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm",
                          !n.read && "font-medium",
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {n.at}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
