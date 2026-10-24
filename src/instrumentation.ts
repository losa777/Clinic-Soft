/** სერვერის გაშვებისას ერთხელ (Next): ფონური ამოცანები. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // ჩატის ავტომატური გასუფთავება — ტაიმერი, დღეში ერთხელ (admin/chat)
    const { startRetentionScheduler } = await import("@/modules/chat/server/retention");
    startRetentionScheduler();
    // საწყობი: ვარგისიანობის ვადის გაფრთხილება — დღეში ერთხელ
    const { startExpiryScheduler } = await import("@/modules/inventory/server/alerts");
    startExpiryScheduler();
  }
}
