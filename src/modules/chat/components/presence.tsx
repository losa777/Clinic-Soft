"use client";

import { UsersRound } from "lucide-react";
import { usePresence } from "@/modules/chat/client/hooks";
import { PRESENCE_LABELS } from "@/modules/chat/presence";
import { lastSeenText } from "@/modules/chat/time";
import type { Presence, PresenceStatus } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

const DOT_COLORS: Record<PresenceStatus, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  dnd: "bg-red-500",
  offline: "bg-zinc-400 dark:bg-zinc-500",
};

/** სტატუსის ტექსტი: „აქტიური“ … ან გასულზე — „ბოლოს იყო: …“. */
export function presenceText(p: Presence, now?: Date): string {
  return p.status === "offline" ? lastSeenText(p.lastSeenAt, now) : PRESENCE_LABELS[p.status];
}

export function PresenceDot({ presence, className }: { presence: Presence; className?: string }) {
  const label = presenceText(presence);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-2 ring-background", DOT_COLORS[presence.status], className)}
    />
  );
}

/** სტატუსი userId-ით (ცოცხლად). */
export function UserPresenceDot({ userId, className }: { userId: number; className?: string }) {
  return <PresenceDot presence={usePresence(userId)} className={className} />;
}

const AVATAR_TINTS = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
];

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm" } as const;

/** ინიციალები + სტატუსის წერტილი (კუთხეში). */
export function UserAvatar({
  user,
  size = "md",
  showPresence = true,
}: {
  user: { id: number; firstName: string; lastName: string };
  size?: keyof typeof SIZES;
  showPresence?: boolean;
}) {
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
  return (
    <span className="relative inline-flex shrink-0" aria-hidden={!showPresence}>
      <span
        className={cn("inline-flex items-center justify-center rounded-full font-medium select-none", SIZES[size], AVATAR_TINTS[user.id % AVATAR_TINTS.length])}
        aria-hidden
      >
        {initials}
      </span>
      {showPresence && <UserPresenceDot userId={user.id} className="absolute -right-0.5 -bottom-0.5" />}
    </span>
  );
}

export function GroupAvatar({ size = "md" }: { size?: keyof typeof SIZES }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary", SIZES[size])} aria-hidden>
      <UsersRound className="size-1/2" />
    </span>
  );
}
