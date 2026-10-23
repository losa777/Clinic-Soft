import { prisma } from "@/lib/db";
import { chatHandler } from "@/modules/chat/server/http";
import { listFavorites } from "@/modules/chat/server/users";

/** ჩემი Favorites (მხოლოდ აქტიური თანამშრომლები) სტატუსებით. */
export async function GET() {
  return chatHandler(async (me) => ({ users: await listFavorites(prisma, me.id) }));
}
