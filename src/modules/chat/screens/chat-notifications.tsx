"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import { claimNotification, playSound, showNotification, unlockAudioOnGesture } from "@/modules/chat/client/notify";
import { selectTotalUnread } from "@/modules/chat/components/chat-button";
import { fullName, previewText, snippet } from "@/modules/chat/format";

const TITLE_PREFIX = /^\(\d+\+?\) /;

/**
 * ახალი შეტყობინება (არა საკუთარი): ხმა, toast (ტაბი ჩანს, საუბარი ღია არ არის), ბრაუზერის Notification (ტაბი ფონზეა).
 * საუბრის mute და „არ შემაწუხოთ“ — მხოლოდ badge. ტაბის სათაურში — წაუკითხავების რაოდენობა „(3) …“.
 */
export function ChatNotifications() {
  const client = useChatClient();
  const router = useRouter();
  const pathname = usePathname();
  const unread = useChat(selectTotalUnread);

  useEffect(() => unlockAudioOnGesture(), []);

  useEffect(() => {
    const open = (conversationId: number) => {
      if (window.location.pathname === "/chat") router.push(`/chat?c=${conversationId}`);
      else client.setPopup({ open: true, conversationId });
    };

    return client.onMessage(async (m, conversation) => {
      const { settings, manualStatus } = client.store.getState();
      if (!conversation || conversation.muted || manualStatus === "dnd") return;
      if (client.isReading(m.conversationId) && document.visibilityState === "visible") return;

      const sender = fullName(m.sender);
      const title = conversation.type === "group" ? `${conversation.name} — ${sender}` : sender;
      const text = snippet(
        previewText({ kind: m.kind, body: m.body, deleted: m.deleted, event: m.event, actorName: sender, targetName: m.target ? fullName(m.target) : null, attachments: m.attachments.length }),
        140,
      );

      if (document.visibilityState === "visible") {
        toast(title, { description: text, action: { label: "გახსნა", onClick: () => open(m.conversationId) } });
      }
      if (!(await claimNotification(`m${m.id}`))) return;
      if (settings.soundEnabled) playSound();
      if (settings.notificationsEnabled && document.visibilityState !== "visible") {
        showNotification(title, text, `chat-${m.conversationId}`, () => open(m.conversationId));
      }
    });
  }, [client, router]);

  // „(3) ექიმი · კლინიკა“: Next სათაურს ნავიგაციისას ცვლის — ამიტომ <title>-ის ცვლილებას ვადევნებთ თვალს
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, "");
      const want = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(TITLE_PREFIX, "");
    };
  }, [unread, pathname]);

  return null;
}
