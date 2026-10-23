"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useChat } from "@/modules/chat/client/provider";
import type { Presence } from "@/modules/chat/types";

const OFFLINE: Presence = { status: "offline", lastSeenAt: null };

/** თანამშრომლის მიმდინარე სტატუსი (სოკეტით განახლებადი). */
export function usePresence(userId: number | null | undefined): Presence {
  return useChat((s) => (userId ? (s.presence[userId] ?? OFFLINE) : OFFLINE));
}

/** მნიშვნელობა ms დაყოვნებით (ძებნა აკრეფისას). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};

/** ტაბი ეკრანზეა (არა ფონზე / ჩაკეცილი). */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
}

/** ყოველ წუთში ახალი „ახლა“ — „ბოლოს იყო“, „დღეს/გუშინ“ რომ არ გაძველდეს. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
