"use client";

import { memo } from "react";
import { Check, CheckCheck, CircleAlert, Clock, Copy, EllipsisVertical, Pencil, Reply, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@/lib/browser-compat";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { UiMessage } from "@/modules/chat/client/store";
import { MessageAttachments } from "@/modules/chat/components/attachments";
import { MessageText } from "@/modules/chat/components/message-text";
import { DELETED_TEXT, fullName, systemText } from "@/modules/chat/format";
import { fullTime, messageTime } from "@/modules/chat/time";
import type { ChatMessage } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

/** წაკითხვის სტატუსი საკუთარ შეტყობინებაზე: ✓ გაგზავნილია, ✓✓ წაკითხულია (ჯგუფში — ვინ). */
export type ReadInfo = { readBy: string[]; total: number };

export type MessageActions = {
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onRetry: (m: UiMessage) => void;
  onDiscard: (m: UiMessage) => void;
  onQuoteClick: (messageId: number) => void;
};

type Props = {
  message: UiMessage;
  mine: boolean;
  /** ჯგუფში, ავტორის პირველ შეტყობინებაზე — სახელი */
  showSender: boolean;
  /** წინა შეტყობინება იმავე ავტორისაა — მცირე დაშორება */
  continued: boolean;
  read: ReadInfo | null;
  highlighted: boolean;
  actions: MessageActions;
};

export const MessageItem = memo(function MessageItem({ message: m, mine, showSender, continued, read, highlighted, actions }: Props) {
  if (m.kind === "system") {
    return (
      <div data-message-id={m.id} className="my-2 text-center text-xs text-muted-foreground" role="note">
        {systemText(m.event, fullName(m.sender), m.target ? fullName(m.target) : null, m.body)} · {messageTime(m.createdAt)}
      </div>
    );
  }

  const confirmed = m.id > 0 && !m.pending;
  const canAct = confirmed && !m.deleted;

  return (
    <div
      data-message-id={m.id}
      className={cn("group/msg flex items-end gap-1", mine ? "flex-row-reverse" : "flex-row", continued ? "mt-0.5" : "mt-2")}
    >
      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-3 py-1.5 text-sm shadow-xs transition-colors",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
          m.pending === "failed" && "bg-destructive/10 text-foreground ring-1 ring-destructive/40",
          highlighted && "ring-2 ring-amber-400",
        )}
      >
        {showSender && !mine && <p className="mb-0.5 text-xs font-semibold text-primary">{fullName(m.sender)}</p>}

        {m.replyTo && (
          <button
            type="button"
            onClick={() => actions.onQuoteClick(m.replyTo!.id)}
            className={cn(
              "mb-1 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs",
              mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-background/60",
            )}
            aria-label={`პასუხი შეტყობინებაზე: ${fullName(m.replyTo.sender)}`}
          >
            <span className="block font-medium">{fullName(m.replyTo.sender)}</span>
            <span className="line-clamp-2 opacity-80">
              {m.replyTo.deleted ? DELETED_TEXT : m.replyTo.text || (m.replyTo.hasAttachments ? "📎 ფაილი" : "")}
            </span>
          </button>
        )}

        {!m.deleted && m.attachments.length > 0 && <MessageAttachments attachments={m.attachments} mine={mine} />}

        {m.deleted ? (
          <p className="italic opacity-70">{DELETED_TEXT}</p>
        ) : (
          m.body && <MessageText text={m.body} />
        )}

        <span className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {m.editedAt && !m.deleted && <span title={`შეცვლილია: ${fullTime(m.editedAt)}`}>შეცვლილია ·</span>}
          <time dateTime={m.createdAt} title={fullTime(m.createdAt)}>
            {messageTime(m.createdAt)}
          </time>
          {mine && <DeliveryIcon message={m} read={read} />}
        </span>

        {m.pending === "failed" && (
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
            <CircleAlert className="size-3.5" />
            {m.error ?? "ვერ გაიგზავნა"}
            <button type="button" onClick={() => actions.onRetry(m)} className="inline-flex items-center gap-1 font-medium underline">
              <RotateCw className="size-3" />
              ხელახლა ცდა
            </button>
            <button type="button" onClick={() => actions.onDiscard(m)} className="font-medium underline">
              წაშლა
            </button>
          </span>
        )}
      </div>

      {canAct && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-md p-1 text-muted-foreground opacity-0 outline-none group-hover/msg:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:opacity-100"
            aria-label="შეტყობინების მოქმედებები"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align={mine ? "end" : "start"} className="w-44">
            <DropdownMenuItem onClick={() => actions.onReply(m)}>
              <Reply />
              პასუხი
            </DropdownMenuItem>
            {m.body && (
              <DropdownMenuItem
                onClick={() =>
                  copyText(m.body ?? "").then(
                    () => toast.success("დაკოპირდა"),
                    () => toast.error("ვერ დაკოპირდა"),
                  )
                }
              >
                <Copy />
                კოპირება
              </DropdownMenuItem>
            )}
            {mine && (
              <>
                <DropdownMenuItem onClick={() => actions.onEdit(m)}>
                  <Pencil />
                  შეცვლა
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(m)}>
                  <Trash2 />
                  წაშლა
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
});

function DeliveryIcon({ message: m, read }: { message: UiMessage; read: ReadInfo | null }) {
  if (m.pending === "sending") return <Clock className="size-3.5" aria-label="იგზავნება" />;
  if (m.pending === "failed") return <CircleAlert className="size-3.5" aria-label="ვერ გაიგზავნა" />;
  if (!read || read.readBy.length === 0) return <Check className="size-3.5" aria-label="გაგზავნილია" />;
  const all = read.readBy.length >= read.total;
  const label = read.total > 1 ? `წაიკითხა: ${read.readBy.join(", ")}` : "წაკითხულია";
  return (
    <span className="inline-flex items-center gap-0.5" title={label} aria-label={label} role="img">
      <CheckCheck className={cn("size-3.5", all && "text-sky-300 dark:text-sky-300")} />
      {read.total > 1 && !all && <span>{read.readBy.length}</span>}
    </span>
  );
}
