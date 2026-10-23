import type { PresenceStatus } from "@/modules/chat/types";

/**
 * სტატუსის წესი (სუფთა ფუნქცია, ტესტებით — presence.test.mts):
 * - კავშირი (ღია ტაბი) არ არის → offline (გასულია);
 * - „არ შემაწუხოთ“ ხელით → dnd;
 * - ერთ კავშირში მაინც აქტივობა awayMs-ზე ნაკლები ხნის წინ → online (აქტიური);
 * - სხვაგვარად → away (არ არის კომპიუტერთან).
 * lastActiveAts — თითო კავშირის ბოლო აქტივობის დრო (ms).
 */
export function presenceStatus(lastActiveAts: Iterable<number>, manual: "dnd" | null, now: number, awayMs: number): PresenceStatus {
  let connected = false;
  let latest = -Infinity;
  for (const t of lastActiveAts) {
    connected = true;
    if (t > latest) latest = t;
  }
  if (!connected) return "offline";
  if (manual === "dnd") return "dnd";
  return now - latest < awayMs ? "online" : "away";
}

/** ბრაუზერის აქტივობის შეტყობინება სერვერზე: მაქსიმუმ ერთხელ ამ ინტერვალში (awayMs-ზე ბევრად ნაკლები). */
export const ACTIVITY_SEND_MS = 30_000;

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: "აქტიური",
  away: "არ არის კომპიუტერთან",
  dnd: "არ შემაწუხოთ",
  offline: "გასულია",
};
