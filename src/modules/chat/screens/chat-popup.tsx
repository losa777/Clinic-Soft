"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Maximize2, MessageSquare, Minus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import type { ChatState } from "@/modules/chat/client/store";
import { selectTotalUnread, UnreadBadge } from "@/modules/chat/components/chat-button";
import { ConversationList } from "@/modules/chat/components/conversation-list";
import { ConversationView } from "@/modules/chat/components/conversation-view";
import { ConnectionBanner } from "@/modules/chat/components/status-bars";
import { cn } from "@/lib/utils";

/** popup-ის მდგომარეობა გვერდის განახლებასაც გადაურჩება (ამ ტაბში). */
const STORAGE_KEY = "clinic-chat:popup";
const PANEL_ID = "chat-popup-panel";

function readStored(): ChatState["popup"] | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (v && typeof v.open === "boolean") return { open: v.open, conversationId: Number.isSafeInteger(v.conversationId) ? v.conversationId : null };
  } catch {
    // არასწორი / აკრძალული საცავი
  }
  return null;
}

/** Esc დიალოგში / მენიუში მათ ეკუთვნის (portal-იდან React-ის ხეში ამოდის) — popup-ს არ ხურავს. */
function inOverlay(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('[role="dialog"]:not(#chat-popup-panel), [role="alertdialog"], [role="menu"]');
}

/**
 * Popup ჩატი ეკრანის მარჯვენა ქვედა კუთხეში ყველა გვერდზე (/chat-ის გარდა). მდგომარეობა (გახსნილია, საუბარი)
 * ChatClient-შია (layout-ში) — გვერდებს შორის არ იკარგება. ტელეფონზე სრულ ეკრანზე იშლება.
 */
export function ChatPopup() {
  const pathname = usePathname();
  const client = useChatClient();
  const popup = useChat((s) => s.popup);
  const unread = useChat(selectTotalUnread);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  // აღდგენა sessionStorage-იდან (ერთხელ), შემდეგ — ყოველი ცვლილების ჩაწერა
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const stored = readStored();
      if (stored) client.setPopup(stored);
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(popup));
    } catch {
      // private რეჟიმი — მხოლოდ მეხსიერებაში
    }
  }, [client, popup]);

  const open = useCallback(() => client.setPopup({ open: true }), [client]);
  const close = useCallback(() => {
    client.setPopup({ open: false });
    fabRef.current?.focus();
  }, [client]);
  const back = useCallback(() => client.setPopup({ conversationId: null }), [client]);

  // გახსნისას ფოკუსი პანელში
  useEffect(() => {
    if (popup.open) panelRef.current?.focus();
  }, [popup.open]);

  if (pathname === "/chat" || pathname.startsWith("/chat/")) return null;

  const fullHref = popup.conversationId ? `/chat?c=${popup.conversationId}` : "/chat";
  const headerButtons = (
    <>
      <Link href={fullHref} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="სრულ გვერდზე გახსნა" title="სრულ გვერდზე გახსნა">
        <Maximize2 />
      </Link>
      <Button variant="ghost" size="icon" onClick={close} aria-label="ჩაკეცვა" title="ჩაკეცვა (Esc)">
        <Minus />
      </Button>
    </>
  );

  return (
    <div className="print:hidden">
      {popup.open && (
        <div
          id={PANEL_ID}
          ref={panelRef}
          role="dialog"
          aria-label="ჩატი"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !inOverlay(e.target)) {
              e.preventDefault();
              close();
            }
          }}
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden bg-background shadow-2xl outline-none",
            "inset-0 sm:inset-auto sm:right-4 sm:bottom-20 sm:h-[min(38rem,calc(100dvh-7rem))] sm:w-[26rem] sm:rounded-xl sm:border",
          )}
        >
          {popup.conversationId !== null ? (
            <ConversationView
              conversationId={popup.conversationId}
              visible
              onClosed={back}
              leading={
                <Button variant="ghost" size="icon" onClick={back} aria-label="საუბრების სიაზე დაბრუნება">
                  <ChevronLeft />
                </Button>
              }
              trailing={headerButtons}
            />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b py-1.5 pr-2 pl-3">
                <MessageSquare className="size-5 text-primary" aria-hidden />
                <h2 className="flex-1 text-base font-semibold">ჩატი</h2>
                {headerButtons}
              </div>
              <ConnectionBanner />
              <ConversationList selectedId={null} onSelect={(id) => client.setPopup({ conversationId: id })} />
            </>
          )}
        </div>
      )}

      <button
        ref={fabRef}
        type="button"
        onClick={popup.open ? close : open}
        aria-expanded={popup.open}
        aria-controls={popup.open ? PANEL_ID : undefined}
        aria-label={unread ? `ჩატი: ${unread} წაუკითხავი` : "ჩატი"}
        title="ჩატი"
        className={cn(
          "fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform outline-none hover:scale-105 focus-visible:ring-4 focus-visible:ring-ring/50",
          popup.open && "max-sm:hidden",
        )}
      >
        <MessageSquare className="size-6" />
        <UnreadBadge count={unread} className="-top-0.5 -right-0.5" />
      </button>
    </div>
  );
}
