"use client";

import { useEffect, useMemo, useState } from "react";
import { BellOff, Pin, Search, Settings, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue, useMinuteClock } from "@/modules/chat/client/hooks";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import { CallButton } from "@/modules/chat/components/call-panel";
import { ContactRow } from "@/modules/chat/components/contact-row";
import { NewGroupDialog } from "@/modules/chat/components/group-dialogs";
import { GroupAvatar, UserAvatar } from "@/modules/chat/components/presence";
import { ChatSettingsDialog } from "@/modules/chat/components/settings-dialog";
import { listTime } from "@/modules/chat/time";
import type { ChatContact, ConversationSummary } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * მარცხენა სვეტი / popup-ის პირველი ეკრანი: ძებნა (საუბრები + თანამშრომლები), Favorites სტატუსებით, საუბრების სია.
 * onSelect — საუბრის გახსნა (სრულ გვერდზე — URL, popup-ში — state).
 */
export function ConversationList({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const client = useChatClient();
  const status = useChat((s) => s.conversationsStatus);
  const order = useChat((s) => s.order);
  const conversations = useChat((s) => s.conversations);
  const favorites = useChat((s) => s.favorites);
  const [query, setQuery] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dnd = useChat((s) => s.manualStatus === "dnd");
  const q = query.trim().toLowerCase();

  const openContact = async (contact: ChatContact) => {
    const id = await client.openDirect(contact.id);
    if (id) {
      setQuery("");
      onSelect(id);
    }
  };

  const filtered = useMemo(
    () => (q ? order.filter((id) => conversations[id]?.name.toLowerCase().includes(q)) : order),
    [q, order, conversations],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="ძებნა: სახელი, გვარი, როლი"
            aria-label="საუბრებისა და თანამშრომლების ძებნა"
            className="h-9 pr-8 pl-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="ძებნის გასუფთავება"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Button variant="outline" size="icon-lg" onClick={() => setGroupOpen(true)} aria-label="ახალი ჯგუფი" title="ახალი ჯგუფი">
          <UsersRound />
        </Button>
        <Button variant="ghost" size="icon-lg" onClick={() => setSettingsOpen(true)} aria-label="ჩატის პარამეტრები" title="პარამეტრები">
          <Settings />
        </Button>
      </div>
      {dnd && (
        <button
          type="button"
          onClick={() => void client.setDoNotDisturb(false)}
          className="flex items-center gap-2 border-b bg-red-50 px-3 py-1.5 text-left text-xs text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300"
        >
          <span className="size-2 rounded-full bg-red-500" aria-hidden />
          <span className="flex-1">„არ შემაწუხოთ“ ჩართულია — ხმა და შეტყობინებები გამორთულია</span>
          <span className="font-medium underline">გამორთვა</span>
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {q ? (
          <>
            <Section title="საუბრები">
              {filtered.length === 0 ? (
                <Empty>საუბარი ვერ მოიძებნა</Empty>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((id) => (
                    <ConversationRow key={id} conversation={conversations[id]} selected={id === selectedId} onSelect={onSelect} highlight={q} />
                  ))}
                </ul>
              )}
            </Section>
            <EmployeeResults query={query} onOpen={openContact} />
          </>
        ) : (
          <>
            {favorites && favorites.length > 0 && (
              <Section title="Favorites">
                <ul className="space-y-0.5">
                  {favorites.map((f) => (
                    <ContactRow key={f.id} contact={f} onOpen={openContact} />
                  ))}
                </ul>
              </Section>
            )}
            <Section title="საუბრები">
              {status === "loading" ? (
                <ListSkeleton />
              ) : status === "error" ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  <p>საუბრები ვერ ჩაიტვირთა</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => void client.loadConversations()}>
                    ხელახლა ცდა
                  </Button>
                </div>
              ) : order.length === 0 ? (
                <Empty>
                  საუბრები ჯერ არ გაქვთ.
                  <br />
                  მოძებნეთ თანამშრომელი და დაიწყეთ საუბარი.
                </Empty>
              ) : (
                <ul className="space-y-0.5">
                  {order.map((id) => (
                    <ConversationRow key={id} conversation={conversations[id]} selected={id === selectedId} onSelect={onSelect} />
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>

      <NewGroupDialog open={groupOpen} onOpenChange={setGroupOpen} onCreated={onSelect} />
      <ChatSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3" aria-label={title}>
      <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-1" aria-busy="true" aria-label="იტვირთება">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-2 py-2">
          <span className="size-10 animate-pulse rounded-full bg-muted" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3 w-2/5 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** თანამშრომლების ძებნა სერვერზე (debounce-ით). */
function EmployeeResults({ query, onOpen }: { query: string; onOpen: (c: ChatContact) => void }) {
  const client = useChatClient();
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const [result, setResult] = useState<{ q: string; users: ChatContact[] | null; error: string | null }>({ q: "", users: null, error: null });

  useEffect(() => {
    if (!debounced) return;
    let cancelled = false;
    client
      .searchUsers(debounced)
      .then((users) => !cancelled && setResult({ q: debounced, users, error: null }))
      .catch(() => !cancelled && setResult({ q: debounced, users: null, error: "ძებნა ვერ მოხერხდა" }));
    return () => {
      cancelled = true;
    };
  }, [client, debounced]);

  const loading = result.q !== debounced || debounced !== query.trim();
  return (
    <Section title="თანამშრომლები">
      {loading ? (
        <ListSkeleton rows={2} />
      ) : result.error ? (
        <Empty>{result.error}</Empty>
      ) : !result.users?.length ? (
        <Empty>თანამშრომელი ვერ მოიძებნა</Empty>
      ) : (
        <ul className="space-y-0.5">
          {result.users.map((u) => (
            <ContactRow key={u.id} contact={u} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function ConversationRow({
  conversation: c,
  selected,
  onSelect,
  highlight,
}: {
  conversation: ConversationSummary;
  selected: boolean;
  onSelect: (id: number) => void;
  highlight?: string;
}) {
  const meId = useChat((s) => s.me.id);
  const typing = useChat((s) => Object.keys(s.typing[c.id] ?? {}).length > 0);
  const now = useMinuteClock();
  const preview = c.lastMessage
    ? `${c.lastMessage.senderId === meId && c.type === "direct" ? "თქვენ: " : c.type === "group" && c.lastMessage.senderId !== meId && c.lastMessage.senderName ? `${c.lastMessage.senderName.split(" ")[0]}: ` : ""}${c.lastMessage.text}`
    : c.type === "group"
      ? "ჯგუფი შეიქმნა"
      : "შეტყობინებები ჯერ არ არის";
  const unread = c.unread > 0;

  // პირად საუბარში — დარეკვის ღილაკი სტრიქონის ბოლოს (სტრიქონის ღილაკის გვერდით, არა შიგნით)
  const callable = c.type === "direct" && c.peer?.isActive ? c.peer : null;

  return (
    <li className={cn("flex items-center rounded-lg hover:bg-muted", selected && "bg-accent hover:bg-accent", callable && "pr-1")}>
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={selected ? "true" : undefined}
        aria-label={`${c.name}${unread ? `, ${c.unread} წაუკითხავი` : ""}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {c.type === "group" ? <GroupAvatar /> : c.peer ? <UserAvatar user={c.peer} /> : <GroupAvatar />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
              {highlight ? <HighlightName name={c.name} q={highlight} /> : c.name}
            </span>
            {c.peer && !c.peer.isActive && <span className="shrink-0 text-xs text-muted-foreground">(გათიშული)</span>}
            {c.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="ჩამაგრებული" />}
            {c.muted && <BellOff className="size-3 shrink-0 text-muted-foreground" aria-label="ხმა გამორთულია" />}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{listTime(c.lastMessage?.at ?? c.activityAt, now)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-xs", typing ? "text-primary italic" : unread ? "text-foreground" : "text-muted-foreground")}>
              {typing ? "წერს…" : preview}
            </span>
            {unread && (
              <span
                className={cn(
                  "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  c.muted ? "bg-muted-foreground/30 text-foreground" : "bg-primary text-primary-foreground",
                )}
                aria-hidden
              >
                {c.unread > 99 ? "99+" : c.unread}
              </span>
            )}
          </span>
        </span>
      </button>
      {callable && <CallButton user={callable} className="size-8 shrink-0" />}
    </li>
  );
}

function HighlightName({ name, q }: { name: string; q: string }) {
  const i = name.toLowerCase().indexOf(q);
  if (i < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, i)}
      <mark className="rounded-sm bg-amber-200 text-inherit dark:bg-amber-500/40">{name.slice(i, i + q.length)}</mark>
      {name.slice(i + q.length)}
    </>
  );
}
