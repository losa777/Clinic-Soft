import { prisma } from "@/lib/db";
import { manualStatusSchema } from "@/modules/chat/schema";
import { chatHandler, rateLimit, readJson } from "@/modules/chat/server/http";
import { getManualStatus, loadPresence, setManualStatus } from "@/modules/chat/server/presence";

/** ჩემი სტატუსი: მიმდინარე + ხელით დაყენებული („არ შემაწუხოთ“). */
export async function GET() {
  return chatHandler(async (me) => {
    const [presence, manualStatus] = await Promise.all([loadPresence(prisma, [me.id]), getManualStatus(prisma, me.id)]);
    return { presence: presence.get(me.id), manualStatus };
  });
}

/** „არ შემაწუხოთ“ ჩართვა ({ manualStatus: "dnd" }) / გამორთვა ({ manualStatus: null }). */
export async function PUT(request: Request) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const { manualStatus } = await readJson(request, manualStatusSchema);
    await setManualStatus(prisma, me.id, manualStatus);
    const presence = await loadPresence(prisma, [me.id]);
    return { presence: presence.get(me.id), manualStatus };
  });
}
