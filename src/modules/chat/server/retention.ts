import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { removeDocuments } from "@/lib/document-storage";
import { emitHistoryPurged } from "@/modules/chat/realtime/emit";

/**
 * ჩატის ისტორიის გასუფთავება: შეტყობინებები ფიზიკურად იშლება (ისტორიით, ფაილებით — დისკიდანაც).
 * საუბრები, მონაწილეები და Favorites რჩება. ადმინი: ყველაფრის წაშლა ერთბაშად ან ავტომატური —
 * „ინახება ბოლო N დღე“ (დღეში ერთხელ, instrumentation.ts-ის ტაიმერით). პარამეტრები — settings ცხრილში.
 */

const KEYS = {
  enabled: "chat_retention_enabled",
  days: "chat_retention_days",
  lastRunAt: "chat_retention_last_run",
  lastDeleted: "chat_retention_last_deleted",
} as const;

export const RETENTION_DEFAULT_DAYS = 90;
export const RETENTION_MAX_DAYS = 3650;

const DAY_MS = 24 * 60 * 60 * 1000;
/** ერთ ტრანზაქციაში წასაშლელი შეტყობინებები (ცხრილი დიდი ხნით არ იკეტება). */
const BATCH_SIZE = 1000;
/** ტაიმერი ამოწმებს საათში ერთხელ, გასუფთავება — დღეში ერთხელ; პირველი შემოწმება — გაშვებიდან 1 წუთში. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

export type RetentionSettings = {
  enabled: boolean;
  days: number;
  lastRunAt: string | null;
  lastDeleted: number | null;
};

export type PurgeResult = { messages: number; files: number };

export async function loadRetentionSettings(): Promise<RetentionSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const value = (key: string) => rows.find((r) => r.key === key)?.value ?? null;
  const days = Number(value(KEYS.days));
  const lastDeleted = value(KEYS.lastDeleted);
  return {
    enabled: value(KEYS.enabled) === "1",
    days: Number.isInteger(days) && days >= 1 && days <= RETENTION_MAX_DAYS ? days : RETENTION_DEFAULT_DAYS,
    lastRunAt: value(KEYS.lastRunAt),
    lastDeleted: lastDeleted === null ? null : Number(lastDeleted),
  };
}

function saveSettings(values: Partial<Record<keyof typeof KEYS, string>>) {
  return prisma.$transaction(
    Object.entries(values).map(([name, value]) => {
      const key = KEYS[name as keyof typeof KEYS];
      return prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }),
  );
}

export function saveRetentionSettings(enabled: boolean, days: number) {
  return saveSettings({ enabled: enabled ? "1" : "0", days: String(days) });
}

/** სტატისტიკა ადმინის გვერდისთვის. ყველაზე ძველი — პირველი id-ით (created_at-ზე ინდექსი არ არის). */
export async function chatStorageStats() {
  const [counts, oldest] = await Promise.all([
    prisma.$queryRaw<{ messages: bigint; files: bigint; bytes: unknown }[]>`
      SELECT (SELECT COUNT(*) FROM messages) AS messages,
             (SELECT COUNT(*) FROM message_attachments) AS files,
             (SELECT COALESCE(SUM(size), 0) FROM message_attachments) AS bytes`,
    prisma.message.findFirst({ orderBy: { id: "asc" }, select: { createdAt: true } }),
  ]);
  return {
    messages: Number(counts[0]?.messages ?? 0),
    files: Number(counts[0]?.files ?? 0),
    bytes: Number(counts[0]?.bytes ?? 0),
    oldestAt: oldest?.createdAt.toISOString() ?? null,
  };
}

// ერთდროულად მხოლოდ ერთი გასუფთავება (ტაიმერი და ადმინის ღილაკი ერთ პროცესშია, მაგრამ სხვადასხვა მოდულში)
const RUNNING = Symbol.for("clinic-soft.chat.retention.running");
const TIMER = Symbol.for("clinic-soft.chat.retention.timer");
type GlobalWithRetention = typeof globalThis & { [RUNNING]?: boolean; [TIMER]?: ReturnType<typeof setInterval> };
const g = globalThis as GlobalWithRetention;

export class PurgeBusyError extends Error {
  constructor() {
    super("ჩატის გასუფთავება უკვე მიმდინარეობს");
  }
}

/**
 * before-მდე შექმნილი შეტყობინებების წაშლა ნაწილ-ნაწილ. თანმიმდევრობა: პასუხების ბმული (reply_to_id, FK) →
 * რედაქციები → ფაილების ჩანაწერები → შეტყობინებები; ტრანზაქციის შემდეგ — ფაილები დისკიდან.
 * ბოლოს საუბრების last_message_id ხელახლა ითვლება (last_message_at რჩება — სიის რიგი არ იცვლება).
 */
export async function purgeMessages(before: Date): Promise<PurgeResult> {
  if (g[RUNNING]) throw new PurgeBusyError();
  g[RUNNING] = true;
  const result: PurgeResult = { messages: 0, files: 0 };
  const touched = new Set<number>();
  try {
    for (;;) {
      const rows = await prisma.message.findMany({
        where: { createdAt: { lt: before } },
        select: { id: true, conversationId: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;
      const ids = rows.map((r) => r.id);
      const attachments = await prisma.messageAttachment.findMany({ where: { messageId: { in: ids } }, select: { storagePath: true } });
      await prisma.$transaction([
        prisma.message.updateMany({ where: { replyToId: { in: ids } }, data: { replyToId: null } }),
        prisma.messageRevision.deleteMany({ where: { messageId: { in: ids } } }),
        prisma.messageAttachment.deleteMany({ where: { messageId: { in: ids } } }),
        prisma.message.deleteMany({ where: { id: { in: ids } } }),
      ]);
      await removeDocuments(attachments.map((a) => a.storagePath));
      for (const r of rows) touched.add(r.conversationId);
      result.messages += rows.length;
      result.files += attachments.length;
      if (rows.length < BATCH_SIZE) break;
    }
  } finally {
    if (touched.size) {
      await prisma.$executeRaw`
        UPDATE conversations c
        SET c.last_message_id = (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = c.id)
        WHERE c.id IN (${Prisma.join([...touched])})`;
      emitHistoryPurged();
    }
    g[RUNNING] = false;
  }
  return result;
}

/** ავტომატური გასუფთავება: ჩართულია და ბოლო გაშვებიდან დღე გავიდა (force — მაშინვე, პარამეტრის შენახვისას). */
export async function runRetention({ force = false } = {}): Promise<PurgeResult | null> {
  const settings = await loadRetentionSettings();
  if (!settings.enabled) return null;
  const now = Date.now();
  const lastRun = settings.lastRunAt ? Date.parse(settings.lastRunAt) : NaN;
  if (!force && now - lastRun < DAY_MS) return null;
  const result = await purgeMessages(new Date(now - settings.days * DAY_MS));
  await saveSettings({ lastRunAt: new Date(now).toISOString(), lastDeleted: String(result.messages) });
  if (result.messages) console.log(`ჩატი: ${settings.days} დღეზე ძველი ${result.messages} შეტყობინება და ${result.files} ფაილი წაიშალა`);
  return result;
}

/** ტაიმერი (instrumentation.ts): ერთხელ პროცესზე. */
export function startRetentionScheduler() {
  if (g[TIMER]) return;
  const check = () =>
    void runRetention().catch((error) => {
      if (!(error instanceof PurgeBusyError)) console.error("ჩატი: ავტომატური გასუფთავება ვერ შესრულდა:", error);
    });
  g[TIMER] = setInterval(check, CHECK_INTERVAL_MS);
  g[TIMER].unref?.();
  setTimeout(check, FIRST_CHECK_MS).unref?.();
}
