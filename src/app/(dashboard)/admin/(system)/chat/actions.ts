"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { requireRole } from "@/lib/dal";
import { audit } from "@/lib/audit";
import {
  type PurgeResult,
  PurgeBusyError,
  purgeMessages,
  RETENTION_MAX_DAYS,
  runRetention,
  saveRetentionSettings,
} from "@/modules/chat/server/retention";

const retentionSchema = z.object({
  enabled: z.boolean(),
  days: z
    .number({ error: "შეიყვანეთ დღეების რაოდენობა" })
    .int("მთელი რიცხვი")
    .min(1, "მინიმუმ 1 დღე")
    .max(RETENTION_MAX_DAYS, `მაქსიმუმ ${RETENTION_MAX_DAYS} დღე`),
});

const deleted = (r: PurgeResult) => `წაიშალა ${r.messages} შეტყობინება${r.files ? ` და ${r.files} ფაილი` : ""}`;

/** ავტომატური გასუფთავების პარამეტრები; ჩართვისას N დღეზე ძველი შეტყობინებები მაშინვე იშლება. */
export async function saveRetentionAction(input: z.input<typeof retentionSchema>): Promise<ActionResult> {
  const user = await requireRole("admin");
  const parsed = retentionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { enabled, days } = parsed.data;
  await saveRetentionSettings(enabled, days);
  await audit({
    userId: Number(user.id),
    action: "update",
    entity: "chat_retention",
    details: enabled ? `ავტომატური გასუფთავება: ბოლო ${days} დღე` : "ავტომატური გასუფთავება გამორთულია",
  });
  revalidatePath("/admin/chat");
  if (!enabled) return success("ავტომატური გასუფთავება გამორთულია");
  try {
    const result = await runRetention({ force: true });
    return success(`შენახულია. ${result ? deleted(result) : ""}`.trim());
  } catch (error) {
    if (error instanceof PurgeBusyError) return success("შენახულია. გასუფთავება უკვე მიმდინარეობს");
    console.error("ჩატი: გასუფთავება ვერ შესრულდა:", error);
    return failure("პარამეტრები შენახულია, მაგრამ გასუფთავება ვერ შესრულდა");
  }
}

/** მთელი მიმოწერის წაშლა (ღილაკზე დაჭერის მომენტამდე გაგზავნილი ყველა შეტყობინება და ფაილი). */
export async function purgeAllAction(): Promise<ActionResult> {
  const user = await requireRole("admin");
  try {
    const result = await purgeMessages(new Date());
    await audit({ userId: Number(user.id), action: "purge", entity: "chat", details: deleted(result) });
    revalidatePath("/admin/chat");
    return success(result.messages ? deleted(result) : "ჩატი უკვე ცარიელია");
  } catch (error) {
    if (error instanceof PurgeBusyError) return failure(error.message);
    console.error("ჩატი: გასუფთავება ვერ შესრულდა:", error);
    revalidatePath("/admin/chat");
    return failure("გასუფთავება ვერ დასრულდა. სცადეთ თავიდან");
  }
}
