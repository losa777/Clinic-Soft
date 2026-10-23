"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useChat } from "@/modules/chat/client/provider";
import { fullName } from "@/modules/chat/format";
import type { ConversationDetail } from "@/modules/chat/types";

const EMPTY: Record<number, number> = {};

/** „ნინო ბერიძე წერს…“ / „ნინო და დავითი წერენ…“ / „3 თანამშრომელი წერს…“ */
export function TypingIndicator({ conversationId, detail }: { conversationId: number; detail: ConversationDetail | undefined }) {
  const typing = useChat((s) => s.typing[conversationId] ?? EMPTY);
  const ids = Object.keys(typing).map(Number);
  const names = ids.map((id) => {
    const m = detail?.members.find((x) => x.id === id);
    return m ? (ids.length > 1 ? m.firstName : fullName(m)) : "თანამშრომელი";
  });
  const text =
    names.length === 0 ? "" : names.length === 1 ? `${names[0]} წერს…` : names.length === 2 ? `${names[0]} და ${names[1]} წერენ…` : `${names.length} თანამშრომელი წერს…`;
  return (
    <p className="h-5 truncate px-4 text-xs text-muted-foreground italic" aria-live="polite">
      {text}
    </p>
  );
}

/** კავშირის მდგომარეობა: გაწყდა (აღდგენა მიმდინარეობს) / სესია დასრულდა. პირველი დაკავშირება — 5 წამის შემდეგ ჩანს. */
export function ConnectionBanner() {
  const connection = useChat((s) => s.connection);
  const everConnected = useChat((s) => s.everConnected);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (connection !== "connecting") return;
    const t = setTimeout(() => setSlow(true), 5_000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [connection]);

  if (connection === "unauthorized") {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 px-3 py-1.5 text-xs text-destructive" role="alert">
        <WifiOff className="size-3.5 shrink-0" />
        <span>
          სესია დასრულდა — ჩატი გათიშულია.{" "}
          <Link href="/login" className="font-medium underline">
            შედით თავიდან
          </Link>
        </span>
      </div>
    );
  }
  if (connection === "reconnecting" || (connection === "connecting" && (slow || everConnected))) {
    return (
      <div className="flex items-center gap-2 bg-amber-100 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" role="status">
        <WifiOff className="size-3.5 shrink-0" />
        კავშირი გაწყდა — ვცდილობთ აღდგენას… ახალი შეტყობინებები აღდგენის შემდეგ გამოჩნდება.
      </div>
    );
  }
  return null;
}
