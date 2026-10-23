"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useChat } from "@/modules/chat/client/provider";
import type { ChatState } from "@/modules/chat/client/store";
import { cn } from "@/lib/utils";

/** წაუკითხავები ყველა საუბარში (mute-იანების ჩათვლით — badge ჩანს, ხმა/notification — არა). */
export function selectTotalUnread(s: ChatState): number {
  let total = 0;
  for (const id of s.order) total += s.conversations[id]?.unread ?? 0;
  return total;
}

export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white tabular-nums",
        className,
      )}
      aria-hidden
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** ზედა ზოლის ღილაკი: ჩატის სრული გვერდი, წაუკითხავების რაოდენობით. */
export function ChatHeaderButton() {
  const unread = useChat(selectTotalUnread);
  return (
    <Link
      href="/chat"
      className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "relative")}
      aria-label={unread ? `ჩატი: ${unread} წაუკითხავი` : "ჩატი"}
      title="ჩატი"
    >
      <MessageSquare />
      <UnreadBadge count={unread} />
    </Link>
  );
}
