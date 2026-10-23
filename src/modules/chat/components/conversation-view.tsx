"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, EllipsisVertical, Info, LogOut, Pin, PinOff, Search, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePresence } from "@/modules/chat/client/hooks";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import type { UiMessage } from "@/modules/chat/client/store";
import { Composer, withFiles } from "@/modules/chat/components/composer";
import { GroupInfoDialog } from "@/modules/chat/components/group-dialogs";
import type { MessageActions } from "@/modules/chat/components/message-item";
import { MessageList, MessagesSkeleton } from "@/modules/chat/components/message-list";
import { MessageSearch } from "@/modules/chat/components/message-search";
import { GroupAvatar, presenceText, UserAvatar } from "@/modules/chat/components/presence";
import { ConnectionBanner, TypingIndicator } from "@/modules/chat/components/status-bars";
import { FILE_MAX_BYTES, FILES_PER_MESSAGE } from "@/modules/chat/config";
import { ALLOWED_LABELS, formatSize } from "@/modules/chat/files";
import type { ChatMessage, ConversationSummary } from "@/modules/chat/types";

/**
 * არჩეული საუბარი (სრული გვერდი და popup): სათაური, ძებნა, ისტორია, „წერს...“, ტექსტის ველი.
 * leading / trailing — კონტეინერის ღილაკები (popup: უკან, ჩაკეცვა, სრულ გვერდზე). visible — ეკრანზეა თუ არა.
 */
type ViewProps = {
  conversationId: number;
  visible?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** საუბარი აღარ არის (გავედი / ამომშალეს) */
  onClosed?: () => void;
};

export function ConversationView(props: ViewProps) {
  // სხვა საუბარზე გადასვლა — ახალი state (პასუხი, რედაქტირება, ძებნა, draft-ის ველი)
  return <ConversationViewInner key={props.conversationId} {...props} />;
}

function ConversationViewInner({ conversationId, visible = true, leading, trailing, onClosed }: ViewProps) {
  const client = useChatClient();
  const summary = useChat((s) => s.conversations[conversationId]);
  const detail = useChat((s) => s.details[conversationId]);
  const listStatus = useChat((s) => s.conversationsStatus);
  const meId = useChat((s) => s.me.id);
  const items = useChat((s) => s.messages[conversationId]?.items);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    void client.openConversation(conversationId);
  }, [client, conversationId]);

  // საუბარი წაიშალა სიიდან (გასვლა, ამოშლა) — კონტეინერი ხურავს
  const gone = listStatus === "ready" && !summary;
  useEffect(() => {
    if (gone) onClosed?.();
  }, [gone, onClosed]);

  const actions: MessageActions = useMemo(
    () => ({
      onReply: (m) => {
        setEditing(null);
        setReplyTo(m);
      },
      onEdit: (m) => {
        setReplyTo(null);
        setEditing(m);
      },
      onDelete: (m) => setDeleting(m),
      onRetry: (m: UiMessage) => m.clientId && void client.retry(conversationId, m.clientId),
      onDiscard: (m: UiMessage) => m.clientId && client.discard(conversationId, m.clientId),
      onQuoteClick: (id) => void client.jumpTo(conversationId, id),
    }),
    [client, conversationId],
  );

  const editLast = useCallback(() => {
    const last = items?.findLast((m) => m.sender.id === meId && m.kind === "text" && !m.deleted);
    if (last) setEditing(last);
  }, [items, meId]);

  if (!summary) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {gone ? <p className="m-auto p-6 text-sm text-muted-foreground">საუბარი ვერ მოიძებნა</p> : <MessagesSkeleton />}
      </div>
    );
  }

  const peerInactive = summary.type === "direct" && summary.peer && !summary.peer.isActive;
  const canDrop = !peerInactive && !editing;
  // ფაილების გადმოტანა (drag & drop) მთელ საუბარზე; dragDepth — შვილ ელემენტებზე გადასვლისას ფენა არ „ციმციმებს“
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const dropHandlers = canDrop
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        },
        onDragOver: (e: React.DragEvent) => hasFiles(e) && e.preventDefault(),
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          setFiles((cur) => withFiles(cur, [...e.dataTransfer.files]));
        },
      }
    : {};
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...dropHandlers}>
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium text-primary">
          <Upload className="size-8" aria-hidden />
          ჩააგდეთ ფაილები გასაგზავნად
          <span className="text-xs font-normal text-muted-foreground">
            მაქსიმუმ {FILES_PER_MESSAGE} ფაილი, თითო {formatSize(FILE_MAX_BYTES)} · {ALLOWED_LABELS}
          </span>
        </div>
      )}
      <ConversationHeader summary={summary} memberCount={detail?.members.length} leading={leading} trailing={trailing} onSearch={() => setSearchOpen((o) => !o)} onLeft={onClosed} />
      <ConnectionBanner />
      {searchOpen && <MessageSearch conversationId={conversationId} onClose={() => setSearchOpen(false)} />}
      <MessageList conversationId={conversationId} detail={detail} visible={visible} actions={actions} />
      <TypingIndicator conversationId={conversationId} detail={detail} />
      <Composer
        conversationId={conversationId}
        replyTo={replyTo}
        editing={editing}
        disabledReason={peerInactive ? "თანამშრომელი გათიშულია — შეტყობინებას ვერ გაუგზავნით" : null}
        files={files}
        onFilesChange={setFiles}
        onCancel={() => {
          setReplyTo(null);
          setEditing(null);
        }}
        onEditLast={editLast}
        autoFocus={visible}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="შეტყობინების წაშლა"
        description="შეტყობინების ნაცვლად ყველას გამოუჩნდება „შეტყობინება წაიშალა“."
        onConfirm={() => {
          if (deleting) void client.remove(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function ConversationHeader({
  summary: c,
  memberCount,
  leading,
  trailing,
  onSearch,
  onLeft,
}: {
  summary: ConversationSummary;
  memberCount: number | undefined;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onSearch: () => void;
  onLeft?: () => void;
}) {
  const client = useChatClient();
  const presence = usePresence(c.peer?.id);
  const [infoOpen, setInfoOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const subtitle =
    c.type === "group"
      ? memberCount !== undefined
        ? `${memberCount} მონაწილე`
        : "ჯგუფი"
      : c.peer
        ? c.peer.isActive
          ? `${c.peer.roleName} · ${presenceText(presence)}`
          : `${c.peer.roleName} · გათიშული`
        : "";

  return (
    <div className="flex items-center gap-2 border-b px-2 py-1.5">
      {leading}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 text-left disabled:cursor-default"
        onClick={() => setInfoOpen(true)}
        disabled={c.type !== "group"}
        aria-label={c.type === "group" ? `${c.name} — ჯგუფის ინფორმაცია` : undefined}
      >
        {c.type === "group" ? <GroupAvatar size="sm" /> : c.peer && <UserAvatar user={c.peer} size="sm" />}
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{c.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </button>
      <Button variant="ghost" size="icon" onClick={onSearch} aria-label="ძებნა საუბარში" title="ძებნა საუბარში">
        <Search />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="საუბრის პარამეტრები" title="პარამეტრები" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => void client.setPinned(c.id, !c.pinned)}>
            {c.pinned ? <PinOff /> : <Pin />}
            {c.pinned ? "ჩამაგრების მოხსნა" : "ჩამაგრება"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void client.setMuted(c.id, !c.muted)}>
            {c.muted ? <Bell /> : <BellOff />}
            {c.muted ? "ხმის ჩართვა" : "ხმის გამორთვა"}
          </DropdownMenuItem>
          {c.type === "group" && (
            <DropdownMenuItem onClick={() => setInfoOpen(true)}>
              <Info />
              ჯგუფის ინფორმაცია
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setClearOpen(true)}>
            <Trash2 />
            საუბრის წაშლა
          </DropdownMenuItem>
          {c.type === "group" && (
            <DropdownMenuItem variant="destructive" onClick={() => setLeaveOpen(true)}>
              <LogOut />
              ჯგუფიდან გასვლა
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {trailing}

      {c.type === "group" && <GroupInfoDialog conversationId={c.id} open={infoOpen} onOpenChange={setInfoOpen} onLeft={onLeft} />}
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="საუბრის წაშლა"
        description={
          c.type === "group"
            ? "საუბარი და მისი ისტორია წაიშლება მხოლოდ თქვენთვის — ჯგუფში რჩებით და სხვა მონაწილეებს მიმოწერა არ ეკარგებათ. ახალი შეტყობინება ისევ გამოჩნდება."
            : `მიმოწერა წაიშლება მხოლოდ თქვენთვის — თანამშრომელს (${c.name}) ის დარჩება. ახალი შეტყობინების მოსვლისას საუბარი ისევ გამოჩნდება, ძველი ისტორიის გარეშე.`
        }
        onConfirm={async () => {
          setClearOpen(false);
          if (await client.clearConversation(c.id)) onLeft?.();
        }}
      />
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="ჯგუფიდან გასვლა"
        description="ჯგუფი და მისი შეტყობინებები აღარ გამოჩნდება. დაბრუნება მხოლოდ ჯგუფის შემქმნელს შეუძლია."
        confirmLabel="გასვლა"
        onConfirm={async () => {
          setLeaveOpen(false);
          if (await client.leave(c.id)) onLeft?.();
        }}
      />
    </div>
  );
}
