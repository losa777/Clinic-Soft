"use client";

import { Star } from "lucide-react";
import { usePresence } from "@/modules/chat/client/hooks";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import { CallButton } from "@/modules/chat/components/call-panel";
import { presenceText, UserAvatar } from "@/modules/chat/components/presence";
import { fullName } from "@/modules/chat/format";
import type { ChatContact } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

/** თანამშრომელი (ძებნის შედეგი / Favorites): სტატუსი, როლი, დარეკვა, ვარსკვლავი. დაჭერა — პირადი საუბარი. */
export function ContactRow({ contact, onOpen }: { contact: ChatContact; onOpen: (contact: ChatContact) => void }) {
  const client = useChatClient();
  const presence = usePresence(contact.id);
  const favorite = useChat((s) => s.favorites?.some((f) => f.id === contact.id) ?? false);
  const name = fullName(contact);

  return (
    <li className="group/contact flex items-center gap-1 rounded-lg pr-1 hover:bg-muted focus-within:bg-muted">
      <button
        type="button"
        onClick={() => onOpen(contact)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${name}, ${contact.roleName}, ${presenceText(presence)} — საუბრის გახსნა`}
      >
        <UserAvatar user={contact} size="sm" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {contact.roleName} · {presenceText(presence)}
          </span>
        </span>
      </button>
      {contact.isActive && <CallButton user={contact} className="size-7 text-muted-foreground" />}
      <button
        type="button"
        onClick={() => void client.toggleFavorite(contact)}
        aria-pressed={favorite}
        aria-label={favorite ? `${name} — Favorites-იდან ამოშლა` : `${name} — Favorites-ში დამატება`}
        title={favorite ? "Favorites-იდან ამოშლა" : "Favorites-ში დამატება"}
        className="rounded-md p-1.5 text-muted-foreground outline-none hover:text-amber-500 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Star className={cn("size-4", favorite && "fill-amber-400 text-amber-400")} />
      </button>
    </li>
  );
}
