"use client";

import { createContext, use, useEffect, useState, useSyncExternalStore } from "react";
import { ChatClient } from "@/modules/chat/client/chat-client";
import type { ChatState } from "@/modules/chat/client/store";
import type { UserRef } from "@/modules/chat/types";

const ChatContext = createContext<ChatClient | null>(null);

/**
 * ჩატის კლიენტი ერთი ტაბზე: layout-ში (dashboard), ამიტომ გვერდებს შორის გადასვლისას არ იშლება —
 * ერთი სოკეტის კავშირი, საერთო state სრული გვერდისა და popup-ისთვის.
 */
export function ChatProvider({ me, children }: { me: UserRef; children: React.ReactNode }) {
  const [client] = useState(() => new ChatClient(me));
  useEffect(() => client.start(), [client]);
  return <ChatContext value={client}>{children}</ChatContext>;
}

export function useChatClient(): ChatClient {
  const client = use(ChatContext);
  if (!client) throw new Error("useChatClient: ChatProvider არ არის");
  return client;
}

/** state-ის ნაწილი; კომპონენტი ხელახლა რენდერდება მხოლოდ მისი ცვლილებისას (selector-მა ახალი ობიექტი არ უნდა შექმნას). */
export function useChat<T>(selector: (s: ChatState) => T): T {
  const client = useChatClient();
  const get = () => selector(client.store.getState());
  return useSyncExternalStore(client.store.subscribe, get, get);
}
