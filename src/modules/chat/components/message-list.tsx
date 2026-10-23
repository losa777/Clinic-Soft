"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocumentVisible, useMinuteClock } from "@/modules/chat/client/hooks";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import type { UiMessage } from "@/modules/chat/client/store";
import { type MessageActions, MessageItem, type ReadInfo } from "@/modules/chat/components/message-item";
import { fullName } from "@/modules/chat/format";
import { dayLabel, sameDay } from "@/modules/chat/time";
import type { ConversationDetail } from "@/modules/chat/types";

/** ბოლოდან ამდენ პიქსელამდე — „ბოლოშია“ (ახალი შეტყობინება ავტომატურად ჩანს, წაკითხულად ითვლება). */
const BOTTOM_THRESHOLD_PX = 80;
/** ერთი ავტორის შეტყობინებები ამ დროში ერთ ჯგუფად ჩანს (სახელი ერთხელ). */
const GROUP_GAP_MS = 5 * 60_000;
const HIGHLIGHT_MS = 2_000;

/**
 * ისტორია: დღეების გამყოფები, „ახალი შეტყობინებები“ ზოლი, ძველის ჩატვირთვა ზემოთ სქროლვისას (პოზიცია ინახება),
 * ახალზე ავტომატური სქროლი (თუ ბოლოშია), ღილაკი „ქვემოთ“. visible — ხედი ეკრანზეა (popup გახსნილია).
 */
export function MessageList({
  conversationId,
  detail,
  visible,
  actions,
}: {
  conversationId: number;
  detail: ConversationDetail | undefined;
  visible: boolean;
  actions: MessageActions;
}) {
  const client = useChatClient();
  const state = useChat((s) => s.messages[conversationId]);
  const meId = useChat((s) => s.me.id);
  const unread = useChat((s) => s.conversations[conversationId]?.unread ?? 0);
  const docVisible = useDocumentVisible();
  useMinuteClock(); // „დღეს“ / „გუშინ“ შუაღამისას

  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const prev = useRef<{ firstId: number | null; height: number }>({ firstId: null, height: 0 });

  const rows = useMemo(() => [...(state?.items ?? []), ...(state?.pending ?? [])], [state?.items, state?.pending]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
  }, []);

  // ძველის ჩატვირთვისას პოზიცია ინახება; ახალზე — ბოლოში, თუ ბოლოში იყო
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstId = rows[0]?.id ?? null;
    const { firstId: prevFirst, height: prevHeight } = prev.current;
    if (prevFirst !== null && firstId !== null && firstId < prevFirst && firstId > 0) {
      el.scrollTop += el.scrollHeight - prevHeight;
    } else if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prev.current = { firstId, height: el.scrollHeight };
  }, [rows]);

  // ფოკუსი: ბოლო / პირველი წაუკითხავი / კონკრეტული შეტყობინება (ძებნა, ციტატა)
  const focus = state?.focus;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !focus) return;
    if (focus.id === "bottom") {
      el.scrollTop = el.scrollHeight;
    } else {
      const target = el.querySelector<HTMLElement>(focus.id === "unread" ? "[data-unread-divider]" : `[data-message-id="${focus.id}"]`);
      if (target) target.scrollIntoView({ block: focus.id === "unread" ? "start" : "center" });
      else el.scrollTop = el.scrollHeight;
    }
    measure();
    prev.current = { firstId: prev.current.firstId, height: el.scrollHeight };
  }, [focus, measure]);

  // ძებნის შედეგი / ციტატა — მოკლედ მოინიშნება
  const [seenFocus, setSeenFocus] = useState(focus);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    setHighlightId(typeof focus?.id === "number" ? focus.id : null);
  }
  useEffect(() => {
    if (highlightId === null) return;
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlightId]);

  // ზემოთ / ქვემოთ ჩატვირთვა — როცა კიდე ჩანს
  const hasMoreBefore = state?.hasMoreBefore ?? false;
  const hasMoreAfter = state?.hasMoreAfter ?? false;
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === topRef.current && hasMoreBefore) void client.loadOlder(conversationId);
          if (e.target === bottomRef.current && hasMoreAfter) void client.loadNewer(conversationId);
        }
      },
      { root, rootMargin: "200px 0px" },
    );
    if (topRef.current) observer.observe(topRef.current);
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [client, conversationId, hasMoreBefore, hasMoreAfter, rows.length]);

  // „კითხულობს“: ხედი და ტაბი ჩანს, ბოლოშია, ქვემოთ ჩასატვირთი არაფერია
  const reading = visible && docVisible && atBottom && state?.status === "ready" && !hasMoreAfter;
  useEffect(() => {
    if (!reading) return;
    client.setReading(conversationId, true);
    return () => client.setReading(conversationId, false);
  }, [client, conversationId, reading]);

  // ხილვადობის ცვლილებისას (popup გაიხსნა) — ზომები თავიდან
  useEffect(() => {
    if (visible) measure();
  }, [visible, measure]);

  const readInfo = useMemo(() => {
    const others = detail?.members.filter((m) => m.id !== meId) ?? [];
    return (id: number): ReadInfo => ({
      readBy: others.filter((o) => o.lastReadMessageId >= id).map((o) => fullName(o)),
      total: others.length,
    });
  }, [detail, meId]);

  if (!state || state.status === "loading") return <MessagesSkeleton />;
  if (state.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground" role="alert">
        {state.error ?? "შეტყობინებები ვერ ჩაიტვირთა"}
        <Button variant="outline" size="sm" onClick={() => void client.openConversation(conversationId)}>
          ხელახლა ცდა
        </Button>
      </div>
    );
  }

  const isGroup = detail?.type === "group";
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={measure}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
        role="log"
        aria-label="შეტყობინებები"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
      >
        <div ref={topRef} aria-hidden className="h-px" />
        {state.loadingOlder && <Spinner label="ძველი შეტყობინებები იტვირთება" />}
        {!hasMoreBefore && rows.length > 0 && <p className="py-3 text-center text-xs text-muted-foreground">საუბრის დასაწყისი</p>}
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">შეტყობინებები ჯერ არ არის — დაწერეთ პირველი</p>}

        {rows.map((m, i) => {
          const before = rows[i - 1] as UiMessage | undefined;
          const newDay = !before || !sameDay(before.createdAt, m.createdAt);
          const continued =
            !!before && !newDay && before.kind === "text" && m.kind === "text" && before.sender.id === m.sender.id &&
            Date.parse(m.createdAt) - Date.parse(before.createdAt) < GROUP_GAP_MS && m.id !== state.firstUnreadId;
          const mine = m.sender.id === meId;
          return (
            <Fragment key={m.clientId && m.id < 0 ? m.clientId : m.id}>
              {newDay && (
                <div className="sticky top-0 z-[1] my-2 flex justify-center" role="separator" aria-label={dayLabel(m.createdAt)}>
                  <span className="rounded-full bg-background/90 px-3 py-0.5 text-xs text-muted-foreground shadow-xs ring-1 ring-border">
                    {dayLabel(m.createdAt)}
                  </span>
                </div>
              )}
              {m.id === state.firstUnreadId && (
                <div data-unread-divider className="my-3 flex items-center gap-2 text-xs font-medium text-primary" role="separator">
                  <span className="h-px flex-1 bg-primary/40" />
                  ახალი შეტყობინებები
                  <span className="h-px flex-1 bg-primary/40" />
                </div>
              )}
              <MessageItem
                message={m}
                mine={mine}
                showSender={isGroup && !continued}
                continued={continued}
                read={mine && m.id > 0 ? readInfo(m.id) : null}
                highlighted={m.id === highlightId}
                actions={actions}
              />
            </Fragment>
          );
        })}

        {state.loadingNewer && <Spinner label="იტვირთება" />}
        <div ref={bottomRef} aria-hidden className="h-px" />
      </div>

      {(!atBottom || hasMoreAfter) && (
        <Button
          variant="outline"
          size="sm"
          className="absolute right-4 bottom-3 rounded-full shadow-md"
          onClick={() => void client.jumpToLatest(conversationId)}
          aria-label={unread > 0 ? `ქვემოთ, ${unread} ახალი შეტყობინება` : "ქვემოთ, ბოლო შეტყობინებებზე"}
        >
          <ArrowDown />
          {unread > 0 && <span className="tabular-nums">{unread > 99 ? "99+" : unread}</span>}
        </Button>
      )}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-2 text-muted-foreground" role="status" aria-label={label}>
      <LoaderCircle className="size-4 animate-spin" />
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 p-4" aria-busy="true" aria-label="შეტყობინებები იტვირთება">
      {["w-2/5", "ml-auto w-1/3", "w-1/2", "ml-auto w-2/5", "w-1/4"].map((w, i) => (
        <span key={i} className={`block h-9 animate-pulse rounded-2xl bg-muted ${w}`} />
      ))}
    </div>
  );
}
