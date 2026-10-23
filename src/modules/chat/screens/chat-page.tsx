"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "@/modules/chat/components/conversation-list";
import { ConversationView } from "@/modules/chat/components/conversation-view";
import { ConnectionBanner } from "@/modules/chat/components/status-bars";
import { cn } from "@/lib/utils";

/** არჩეული საუბარი URL-ში (?c=<id>): გვერდის განახლება / ბმულის გაზიარება იმავე საუბარს ხსნის. */
function writeUrl(id: number | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", String(id));
  else url.searchParams.delete("c");
  window.history.replaceState(null, "", url);
}

/**
 * ჩატის სრული გვერდი: მარცხნივ საუბრები + ძებნა, მარჯვნივ არჩეული საუბარი.
 * პატარა ეკრანზე — ან სია, ან საუბარი („უკან“ ღილაკით).
 */
export function ChatPageScreen({ initialConversationId }: { initialConversationId: number | null }) {
  const [selected, setSelected] = useState<number | null>(initialConversationId);

  const select = useCallback((id: number | null) => {
    setSelected(id);
    writeUrl(id);
  }, []);
  const close = useCallback(() => select(null), [select]);

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] overflow-hidden rounded-xl border bg-background">
      <aside
        className={cn("flex w-full min-w-0 flex-col border-r md:w-80 lg:w-96", selected !== null && "hidden md:flex")}
        aria-label="საუბრები"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <MessageSquare className="size-5 text-primary" aria-hidden />
          <h1 className="text-base font-semibold">ჩატი</h1>
        </div>
        <ConversationList selectedId={selected} onSelect={select} />
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col", selected === null ? "hidden md:flex" : "flex")} aria-label="საუბარი">
        {selected !== null ? (
          <ConversationView
            conversationId={selected}
            onClosed={close}
            leading={
              <Button variant="ghost" size="icon" className="md:hidden" onClick={close} aria-label="საუბრების სიაზე დაბრუნება">
                <ChevronLeft />
              </Button>
            }
          />
        ) : (
          <>
            <ConnectionBanner />
            <div className="m-auto flex max-w-xs flex-col items-center gap-2 p-6 text-center text-muted-foreground">
              <MessageSquare className="size-10 opacity-40" aria-hidden />
              <p className="text-sm">აირჩიეთ საუბარი სიიდან ან მოძებნეთ თანამშრომელი ახალი საუბრის დასაწყებად.</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
