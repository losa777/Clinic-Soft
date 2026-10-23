import { prisma } from "@/lib/db";
import { chatHandler, parseId, rateLimit } from "@/modules/chat/server/http";
import { addFavorite, removeFavorite } from "@/modules/chat/server/users";

/** თანამშრომლის დამატება Favorites-ში. */
export async function PUT(_request: Request, ctx: RouteContext<"/api/chat/favorites/[userId]">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    await addFavorite(prisma, me.id, parseId((await ctx.params).userId));
    return { ok: true };
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/chat/favorites/[userId]">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    await removeFavorite(prisma, me.id, parseId((await ctx.params).userId));
    return { ok: true };
  });
}
