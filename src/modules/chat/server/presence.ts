import "server-only";
import { chatPresence } from "@/modules/chat/realtime/registry";
import type { Db } from "@/modules/chat/server/db";
import type { ManualStatus, Presence } from "@/modules/chat/types";

/**
 * თანამშრომლების სტატუსები (ძებნა, Favorites, საუბრები, მონაწილეები): მიმდინარე — სოკეტ-სერვერის მეხსიერებიდან
 * (realtime/presence-store.ts), „ბოლოს იყო“ — ბაზიდან (user_presence.last_seen_at). ერთი მოთხოვნა ყველა id-ზე.
 */
export async function loadPresence(db: Db, userIds: number[]): Promise<Map<number, Presence>> {
  const unique = [...new Set(userIds)];
  const live = chatPresence();
  const status = new Map(unique.map((id) => [id, live?.get(id) ?? "offline"]));
  const offline = unique.filter((id) => status.get(id) === "offline");
  const rows = offline.length
    ? await db.userPresence.findMany({ where: { userId: { in: offline } }, select: { userId: true, lastSeenAt: true } })
    : [];
  const lastSeen = new Map(rows.map((r) => [r.userId, r.lastSeenAt?.toISOString() ?? null]));
  return new Map(
    unique.map((id) => {
      const s = status.get(id)!;
      return [id, { status: s, lastSeenAt: s === "offline" ? (lastSeen.get(id) ?? null) : null }];
    }),
  );
}

export async function getManualStatus(db: Db, userId: number): Promise<ManualStatus> {
  const row = await db.userPresence.findUnique({ where: { userId }, select: { manualStatus: true } });
  return row?.manualStatus ?? null;
}

/** „არ შემაწუხოთ“ (dnd) ან ავტომატური (null): ინახება ბაზაში (მომდევნო შესვლებზეც) და მაშინვე ჩანს სხვებთან. */
export async function setManualStatus(db: Db, userId: number, manualStatus: ManualStatus) {
  await db.userPresence.upsert({ where: { userId }, create: { userId, manualStatus }, update: { manualStatus } });
  chatPresence()?.setManual(userId, manualStatus);
}
