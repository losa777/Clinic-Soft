import { prisma } from "@/lib/db";
import { searchQuerySchema } from "@/modules/chat/schema";
import { chatHandler, rateLimit, readQuery } from "@/modules/chat/server/http";
import { searchUsers } from "@/modules/chat/server/users";

/** აქტიური თანამშრომლების ძებნა: ?q=<სახელი / გვარი / როლი>. */
export async function GET(request: Request) {
  return chatHandler(async (me) => {
    rateLimit("search", me.id);
    const { q } = readQuery(request, searchQuerySchema);
    return { users: await searchUsers(prisma, me.id, q) };
  });
}
