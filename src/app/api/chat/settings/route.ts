import { prisma } from "@/lib/db";
import { chatSettingsSchema } from "@/modules/chat/schema";
import { chatHandler, rateLimit, readJson } from "@/modules/chat/server/http";
import { getChatSettings, updateChatSettings } from "@/modules/chat/server/settings";

/** ჩემი ჩატის პარამეტრები: ხმა, ბრაუზერის შეტყობინებები (ინახება ბაზაში — ყველა კომპიუტერზე მოქმედებს). */
export async function GET() {
  return chatHandler(async (me) => ({ settings: await getChatSettings(prisma, me.id) }));
}

export async function PUT(request: Request) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const data = await readJson(request, chatSettingsSchema);
    return { settings: await updateChatSettings(prisma, me.id, data) };
  });
}
