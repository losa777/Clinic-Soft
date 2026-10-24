"use client";

import { UsersRound } from "lucide-react";
import { usePresence } from "@/modules/chat/client/hooks";
import { PRESENCE_LABELS } from "@/modules/chat/presence";
import { lastSeenText } from "@/modules/chat/time";
import type { Presence, PresenceStatus } from "@/modules/chat/types";
import { Avatar, type AvatarUser } from "@/components/user-avatar";
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

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm" } as const;

/** ფოტო ან ინიციალები (src/components/user-avatar.tsx) + სტატუსის წერტილი (კუთხეში). */
export function UserAvatar({
  user,
  size = "md",
  showPresence = true,
}: {
  user: AvatarUser;
  size?: keyof typeof SIZES;
  showPresence?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0" aria-hidden={!showPresence}>
      <Avatar user={user} className={SIZES[size]} />
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
