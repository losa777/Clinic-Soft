"use client";

import { useEffect, useState } from "react";
import { Check, LogOut, Search, UserMinus, UserPlus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue, usePresence } from "@/modules/chat/client/hooks";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import { presenceText, UserAvatar } from "@/modules/chat/components/presence";
import { GROUP_NAME_MAX_LENGTH } from "@/modules/chat/config";
import { fullName } from "@/modules/chat/format";
import type { ChatContact, ConversationMemberInfo } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

/** თანამშრომლების არჩევა (ძებნით, რამდენიმე): ჯგუფის შექმნა და მონაწილის დამატება. */
function EmployeePicker({
  selected,
  onChange,
  excludeIds = [],
}: {
  selected: ChatContact[];
  onChange: (next: ChatContact[]) => void;
  excludeIds?: number[];
}) {
  const client = useChatClient();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const [result, setResult] = useState<{ q: string; users: ChatContact[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .searchUsers(debounced)
      .then((users) => !cancelled && setResult({ q: debounced, users }))
      .catch(() => !cancelled && setResult({ q: debounced, users: [] }));
    return () => {
      cancelled = true;
    };
  }, [client, debounced]);

  const toggle = (u: ChatContact) =>
    onChange(selected.some((s) => s.id === u.id) ? selected.filter((s) => s.id !== u.id) : [...selected, u]);
  const users = result?.users.filter((u) => !excludeIds.includes(u.id)) ?? [];

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="არჩეული თანამშრომლები">
          {selected.map((u) => (
            <li key={u.id} className="flex items-center gap-1 rounded-full bg-accent py-0.5 pr-1 pl-2.5 text-xs">
              {fullName(u)}
              <button type="button" onClick={() => toggle(u)} aria-label={`${fullName(u)} — ამოშლა`} className="rounded-full p-0.5 hover:bg-background">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ძებნა: სახელი, გვარი, როლი" aria-label="თანამშრომლის ძებნა" className="pl-8" />
      </div>
      <ul className="max-h-60 space-y-0.5 overflow-y-auto" aria-busy={result?.q !== debounced}>
        {result && users.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">თანამშრომელი ვერ მოიძებნა</li>}
        {users.map((u) => {
          const checked = selected.some((s) => s.id === u.id);
          return (
            <li key={u.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(u)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted", checked && "bg-accent")}
              >
                <UserAvatar user={u} size="sm" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-medium">{fullName(u)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{u.roleName}</span>
                </span>
                <span className={cn("flex size-5 items-center justify-center rounded border", checked && "border-primary bg-primary text-primary-foreground")}>
                  {checked && <Check className="size-3.5" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** ახალი ჯგუფი: სახელი + მონაწილეები. */
export function NewGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const client = useChatClient();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<ChatContact[]>([]);
  const [pending, setPending] = useState(false);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      setMembers([]);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const id = await client.createGroup(name.trim(), members.map((m) => m.id));
    setPending(false);
    if (id) {
      close(false);
      onCreated(id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>ახალი ჯგუფი</DialogTitle>
            <DialogDescription>ჯგუფს მართავთ თქვენ: სახელი და მონაწილეები.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="chat-group-name">ჯგუფის სახელი</Label>
            <Input id="chat-group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={GROUP_NAME_MAX_LENGTH} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>მონაწილეები</Label>
            <EmployeePicker selected={members} onChange={setMembers} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              გაუქმება
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || members.length === 0}>
              {pending ? "იქმნება..." : "შექმნა"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** ჯგუფის ინფორმაცია: მონაწილეები სტატუსებით; შემქმნელს — სახელის შეცვლა, დამატება/ამოშლა; ყველას — გასვლა. */
export function GroupInfoDialog({
  conversationId,
  open,
  onOpenChange,
  onLeft,
}: {
  conversationId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft?: () => void;
}) {
  const client = useChatClient();
  const detail = useChat((s) => s.details[conversationId]);
  const meId = useChat((s) => s.me.id);
  const [name, setName] = useState(detail?.name ?? "");
  const [adding, setAdding] = useState<ChatContact[] | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "leave" } | { kind: "remove"; member: ConversationMemberInfo } | null>(null);
  const [pending, setPending] = useState(false);

  // მხოლოდ გახსნისას (სხვაგვარად აკრეფილი სახელი წაიშლებოდა)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(detail?.name ?? "");
      setAdding(null);
    }
  }

  if (!detail) return null;
  const owner = detail.role === "owner";

  const run = async (fn: () => Promise<boolean>) => {
    setPending(true);
    const ok = await fn();
    setPending(false);
    return ok;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detail.name}</DialogTitle>
            <DialogDescription>{detail.members.length} მონაწილე</DialogDescription>
          </DialogHeader>

          {owner && (
            <form
              className="flex items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await run(() => client.rename(conversationId, name.trim()));
              }}
            >
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="chat-group-rename">ჯგუფის სახელი</Label>
                <Input id="chat-group-rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={GROUP_NAME_MAX_LENGTH} required />
              </div>
              <Button type="submit" variant="outline" disabled={pending || !name.trim() || name.trim() === detail.name}>
                შენახვა
              </Button>
            </form>
          )}

          {adding ? (
            <div className="grid gap-2">
              <Label>მონაწილის დამატება</Label>
              <EmployeePicker selected={adding} onChange={setAdding} excludeIds={detail.members.map((m) => m.id)} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdding(null)}>
                  გაუქმება
                </Button>
                <Button
                  disabled={pending || adding.length === 0}
                  onClick={async () => {
                    if (await run(() => client.addMembers(conversationId, adding.map((a) => a.id)))) setAdding(null);
                  }}
                >
                  დამატება
                </Button>
              </div>
            </div>
          ) : (
            <ul className="max-h-72 space-y-0.5 overflow-y-auto" aria-label="მონაწილეები">
              {detail.members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isMe={m.id === meId}
                  canRemove={owner && m.id !== meId}
                  onRemove={() => setConfirm({ kind: "remove", member: m })}
                />
              ))}
            </ul>
          )}

          <DialogFooter className="sm:justify-between">
            <Button variant="destructive" onClick={() => setConfirm({ kind: "leave" })}>
              <LogOut />
              ჯგუფიდან გასვლა
            </Button>
            {owner && !adding && (
              <Button variant="outline" onClick={() => setAdding([])}>
                <UserPlus />
                მონაწილის დამატება
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "leave" ? "ჯგუფიდან გასვლა" : "მონაწილის ამოშლა"}
        description={
          confirm?.kind === "leave"
            ? "ჯგუფი და მისი შეტყობინებები აღარ გამოჩნდება. დაბრუნება მხოლოდ ჯგუფის შემქმნელს შეუძლია."
            : confirm?.kind === "remove"
              ? `${fullName(confirm.member)} ჯგუფს აღარ დაინახავს.`
              : ""
        }
        confirmLabel={confirm?.kind === "leave" ? "გასვლა" : "ამოშლა"}
        pending={pending}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === "leave") {
            if (await run(() => client.leave(conversationId))) {
              setConfirm(null);
              onOpenChange(false);
              onLeft?.();
            }
          } else if (await run(() => client.removeMember(conversationId, confirm.member.id))) {
            setConfirm(null);
          }
        }}
      />
    </>
  );
}

function MemberRow({ member, isMe, canRemove, onRemove }: { member: ConversationMemberInfo; isMe: boolean; canRemove: boolean; onRemove: () => void }) {
  const presence = usePresence(member.id);
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <UserAvatar user={member} size="sm" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">
          {fullName(member)}
          {isMe && <span className="font-normal text-muted-foreground"> (თქვენ)</span>}
          {member.role === "owner" && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">შემქმნელი</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {member.roleName} · {member.isActive ? presenceText(presence) : "გათიშული"}
        </span>
      </span>
      {canRemove && (
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`${fullName(member)} — ჯგუფიდან ამოშლა`} title="ამოშლა">
          <UserMinus />
        </Button>
      )}
    </li>
  );
}
