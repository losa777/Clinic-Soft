import "server-only";
import type { Db } from "@/modules/chat/server/db";
import type { ChatSettings } from "@/modules/chat/types";

/** ჩანაწერის გარეშე — ნაგულისხმევი (ყველაფერი ჩართულია). */
const DEFAULTS: ChatSettings = { soundEnabled: true, notificationsEnabled: true };

export async function getChatSettings(db: Db, userId: number): Promise<ChatSettings> {
  const row = await db.userChatSettings.findUnique({ where: { userId }, select: { soundEnabled: true, notificationsEnabled: true } });
  return row ?? DEFAULTS;
}

export async function updateChatSettings(db: Db, userId: number, data: Partial<ChatSettings>): Promise<ChatSettings> {
  return db.userChatSettings.upsert({
    where: { userId },
    create: { userId, ...DEFAULTS, ...data },
    update: data,
    select: { soundEnabled: true, notificationsEnabled: true },
  });
}
