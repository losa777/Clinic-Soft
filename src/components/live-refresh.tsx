"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LiveTopic } from "@/lib/live-types";
import { useChatClient } from "@/modules/chat/client/provider";

/** რამდენიმე ცვლილება ზედიზედ — ერთი განახლება. */
const DEBOUNCE_MS = 800;

/**
 * გვერდის ავტომატური განახლება, როცა სხვა თანამშრომელმა მონაცემები შეცვალა (src/lib/live.ts).
 * router.refresh: სერვერიდან ახალი მონაცემები, აკრეფილი ტექსტი და ღია ფანჯრები რჩება.
 * ფონური (დამალული) ტაბი არ ახლდება — დაბრუნებისას ერთხელ. doctorUserId — მხოლოდ ამ ექიმის რიგის ცვლილებაზე.
 */
export function LiveRefresh({ topics, doctorUserId }: { topics: LiveTopic[]; doctorUserId?: number }) {
  const client = useChatClient();
  const router = useRouter();
  const key = topics.join(",");

  useEffect(() => {
    const wanted = key.split(",");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    const refresh = () => {
      if (document.hidden) pending = true;
      else router.refresh();
    };
    const off = client.onLive((e) => {
      if (e && !e.topics.some((t) => wanted.includes(t))) return;
      if (e && doctorUserId !== undefined && e.doctorUserIds && !e.doctorUserIds.includes(doctorUserId)) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, DEBOUNCE_MS);
    });
    const onVisible = () => {
      if (document.hidden || !pending) return;
      pending = false;
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, router, key, doctorUserId]);

  return null;
}
