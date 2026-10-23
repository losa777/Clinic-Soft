"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/modules/chat/client/hooks";
import { useChatClient } from "@/modules/chat/client/provider";
import { Highlighted } from "@/modules/chat/components/message-text";
import { fullName, snippet } from "@/modules/chat/format";
import { listTime } from "@/modules/chat/time";
import type { ChatMessage } from "@/modules/chat/types";

type Result = { q: string; messages: ChatMessage[]; hasMore: boolean; error: string | null };

/** ძებნა საუბრის შეტყობინებებში; შედეგზე დაჭერა — ისტორიაში ამ ადგილზე გადასვლა. */
export function MessageSearch({ conversationId, onClose }: { conversationId: number; onClose: () => void }) {
  const client = useChatClient();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const [result, setResult] = useState<Result | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!debounced) return;
    let cancelled = false;
    client
      .searchMessages(conversationId, debounced)
      .then((r) => !cancelled && setResult({ q: debounced, ...r, error: null }))
      .catch(() => !cancelled && setResult({ q: debounced, messages: [], hasMore: false, error: "ძებნა ვერ მოხერხდა" }));
    return () => {
      cancelled = true;
    };
  }, [client, conversationId, debounced]);

  const more = async () => {
    if (!result?.messages.length) return;
    setLoadingMore(true);
    try {
      const r = await client.searchMessages(conversationId, result.q, result.messages.at(-1)!.id);
      setResult((cur) => cur && { ...cur, messages: [...cur.messages, ...r.messages], hasMore: r.hasMore });
    } finally {
      setLoadingMore(false);
    }
  };

  const shown = debounced && result?.q === debounced ? result : null;
  return (
    <div className="flex max-h-[45%] flex-col border-b bg-background">
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
              }
            }}
            placeholder="ძებნა ამ საუბარში"
            aria-label="ძებნა საუბრის შეტყობინებებში"
            className="h-9 pl-8"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="ძებნის დახურვა">
          <X />
        </Button>
      </div>
      {debounced && (
        <div className="min-h-0 overflow-y-auto px-2 pb-2" aria-busy={!shown}>
          {!shown ? (
            <p className="py-3 text-center text-xs text-muted-foreground">იძებნება…</p>
          ) : shown.error ? (
            <p className="py-3 text-center text-xs text-destructive">{shown.error}</p>
          ) : shown.messages.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">ვერაფერი მოიძებნა</p>
          ) : (
            <ul className="space-y-0.5" aria-label="ძებნის შედეგები">
              {shown.messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void client.jumpTo(conversationId, m.id)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-medium">{fullName(m.sender)}</span>
                      <span className="shrink-0 tabular-nums">{listTime(m.createdAt)}</span>
                    </span>
                    <span className="line-clamp-2">
                      <Highlighted text={snippet(m.body ?? "", 200)} query={shown.q} />
                    </span>
                  </button>
                </li>
              ))}
              {shown.hasMore && (
                <li className="pt-1 text-center">
                  <Button variant="link" size="sm" onClick={() => void more()} disabled={loadingMore}>
                    {loadingMore ? "იტვირთება…" : "მეტის ნახვა"}
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
