import { prisma } from "@/lib/db";
import { searchQuerySchema } from "@/modules/chat/schema";
import { chatHandler, parseId, rateLimit, readQuery } from "@/modules/chat/server/http";
import { searchMessages } from "@/modules/chat/server/messages";

/** ძებნა საუბრის შეტყობინებებში: ?q=<ტექსტი>&before=<id>. */
export async function GET(request: Request, ctx: RouteContext<"/api/chat/conversations/[id]/search">) {
  return chatHandler(async (me) => {
    rateLimit("search", me.id);
    const id = parseId((await ctx.params).id);
    const { q, before } = readQuery(request, searchQuerySchema);
    if (!q) return { messages: [], hasMore: false };
    return searchMessages(prisma, me.id, id, q, before);
  });
}
