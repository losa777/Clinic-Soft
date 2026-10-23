"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Pencil, Reply, SendHorizontal, Smile, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useChatClient } from "@/modules/chat/client/provider";
import { OutgoingFiles } from "@/modules/chat/components/attachments";
import { MESSAGE_MAX_LENGTH } from "@/modules/chat/config";
import { ACCEPT_ATTRIBUTE, checkFiles } from "@/modules/chat/files";
import { DELETED_TEXT, fullName, normalizeBody, snippet } from "@/modules/chat/format";
import type { ChatMessage } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

/** დაუგზავნელი ტექსტი საუბრების მიხედვით (საუბრებს შორის გადასვლისას და popup ↔ გვერდი არ იკარგება). */
const drafts = new Map<number, string>();

/** მრიცხველი ჩანს ლიმიტთან მიახლოებისას. */
const COUNTER_FROM = MESSAGE_MAX_LENGTH - 500;

/** მსუბუქი emoji არჩევანი (ბიბლიოთეკის გარეშე). */
const EMOJI = ["👍", "👌", "🙏", "👏", "✅", "❌", "❗", "❓", "😊", "😀", "😂", "😉", "🙂", "😐", "😔", "😢", "😮", "🤔", "😷", "🤒", "❤️", "🔥", "⏰", "📞", "📋", "💊", "🩺", "🏥", "🚑", "☕"];

/** ფაილების დამატება შემოწმებით (ზომა, ტიპი, რაოდენობა); შეცდომა — toast. */
export function withFiles(current: File[], incoming: File[]): File[] {
  if (incoming.length === 0) return current;
  const error = checkFiles(incoming, current.length);
  if (error) {
    toast.error(error);
    return current;
  }
  return [...current, ...incoming];
}

/**
 * ტექსტის ველი: Enter — გაგზავნა, Shift+Enter — ახალი ხაზი, Esc — პასუხის/რედაქტირების გაუქმება,
 * ↑ ცარიელ ველში — ბოლო საკუთარი შეტყობინების შეცვლა. ფაილები: ღილაკი, ჩასმა (paste), გადმოტანა (ConversationView).
 */
export function Composer({
  conversationId,
  replyTo,
  editing,
  disabledReason,
  files,
  onFilesChange,
  onCancel,
  onEditLast,
  autoFocus,
}: {
  conversationId: number;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  disabledReason: string | null;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onCancel: () => void;
  onEditLast: () => void;
  autoFocus?: boolean;
}) {
  const client = useChatClient();
  const [text, setText] = useState(() => drafts.get(conversationId) ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // რედაქტირების დაწყება — ტექსტი ველში; დასრულება — draft-ის დაბრუნება (render-ის დროს, effect-ის გარეშე)
  const [prevEditing, setPrevEditing] = useState(editing);
  if (editing !== prevEditing) {
    setPrevEditing(editing);
    setText(editing ? (editing.body ?? "") : (drafts.get(conversationId) ?? ""));
  }

  useEffect(() => {
    if (editing || replyTo) ref.current?.focus();
  }, [editing, replyTo]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, conversationId]);

  // სურათების preview — blob: მისამართები, ფაილის მოხსნისას/გაგზავნისას თავისუფლდება
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((p) => p && URL.revokeObjectURL(p)), [previews]);

  const change = (value: string) => {
    setText(value);
    if (!editing) {
      if (value) drafts.set(conversationId, value);
      else drafts.delete(conversationId);
      if (value.trim()) client.typing(conversationId);
    }
  };

  const insert = (value: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    change(text.slice(0, start) + value + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const body = normalizeBody(text);
  const tooLong = body.length > MESSAGE_MAX_LENGTH;
  const hasFiles = !editing && files.length > 0;
  const canSubmit = !disabledReason && !saving && !tooLong && (body.length > 0 || hasFiles || (editing?.attachments.length ?? 0) > 0);

  const submit = async () => {
    if (!canSubmit) return;
    if (editing) {
      setSaving(true);
      const ok = await client.edit(editing.id, body);
      setSaving(false);
      if (ok) onCancel();
      return;
    }
    drafts.delete(conversationId);
    setText("");
    const outgoing = files;
    onFilesChange([]);
    onCancel();
    void client.send(conversationId, body, replyTo, outgoing);
    ref.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape" && (editing || replyTo)) {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "ArrowUp" && !text && !editing && files.length === 0) {
      e.preventDefault();
      onEditLast();
    }
  };

  // ჩასმა: სურათი/ფაილი clipboard-იდან (სქრინშოტი) — მიმაგრდება; ტექსტი — ჩვეულებრივად
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (editing) return;
    const pasted = [...e.clipboardData.files];
    if (pasted.length === 0) return;
    e.preventDefault();
    onFilesChange(withFiles(files, pasted.map(namePastedFile)));
  };

  if (disabledReason) {
    return <p className="border-t px-4 py-3 text-center text-sm text-muted-foreground">{disabledReason}</p>;
  }

  const context = editing ?? replyTo;
  return (
    <div className="border-t p-2">
      {context && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs">
          {editing ? <Pencil className="mt-0.5 size-3.5 shrink-0 text-primary" /> : <Reply className="mt-0.5 size-3.5 shrink-0 text-primary" />}
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-primary">{editing ? "შეტყობინების შეცვლა" : `პასუხი: ${fullName(context.sender)}`}</span>
            <span className="block truncate text-muted-foreground">{context.deleted ? DELETED_TEXT : snippet(context.body ?? "", 120)}</span>
          </span>
          <button type="button" onClick={onCancel} aria-label={editing ? "რედაქტირების გაუქმება" : "პასუხის გაუქმება"} className="rounded p-0.5 hover:bg-background">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {!editing && <OutgoingFiles files={files} previews={previews} onRemove={(i) => onFilesChange(files.filter((_, j) => j !== i))} />}
      <div className="flex items-end gap-1">
        {!editing && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="hidden"
              onChange={(e) => {
                onFilesChange(withFiles(files, [...(e.target.files ?? [])]));
                e.target.value = "";
              }}
            />
            <Button variant="ghost" size="icon-lg" onClick={() => fileInput.current?.click()} aria-label="ფაილის მიმაგრება" title="ფაილის მიმაგრება">
              <Paperclip />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="emoji" title="emoji" />}>
            <Smile />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="grid w-auto grid-cols-6 gap-0.5 p-1.5">
            {EMOJI.map((e) => (
              <DropdownMenuItem key={e} onClick={() => insert(e)} className="justify-center px-1.5 text-lg" aria-label={e}>
                {e}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder="დაწერეთ შეტყობინება…"
          title="Enter — გაგზავნა, Shift+Enter — ახალი ხაზი"
          aria-label="შეტყობინების ტექსტი"
          aria-invalid={tooLong || undefined}
          className={cn(
            "field-sizing-content max-h-40 min-h-9 min-w-0 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
            tooLong && "border-destructive",
          )}
        />
        <Button size="icon-lg" onClick={() => void submit()} disabled={!canSubmit} aria-label={editing ? "შენახვა" : "გაგზავნა"} title={editing ? "შენახვა" : "გაგზავნა"}>
          <SendHorizontal />
        </Button>
      </div>
      {body.length > COUNTER_FROM && (
        <p className={cn("mt-1 text-right text-xs tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
          {body.length} / {MESSAGE_MAX_LENGTH}
        </p>
      )}
    </div>
  );
}

/** სქრინშოტს clipboard-ში სახელი „image.png“ აქვს — დრო ემატება, რომ ერთმანეთისგან გაირჩეს. */
function namePastedFile(f: File): File {
  if (f.name && f.name !== "image.png") return f;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return new File([f], `სურათი-${stamp}.${f.type.split("/")[1] || "png"}`, { type: f.type });
}
