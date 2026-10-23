import { prisma } from "@/lib/db";
import { emitConversationChanged, emitConversationHidden, emitMessage } from "@/modules/chat/realtime/emit";
import { updateConversationSchema } from "@/modules/chat/schema";
import { clearConversation, getConversation, renameGroup, updateMembership } from "@/modules/chat/server/conversations";
import { inTx } from "@/modules/chat/server/db";
import { chatHandler, parseId, rateLimit, readJson } from "@/modules/chat/server/http";

/** საუბარი მონაწილეებით (მხოლოდ მონაწილისთვის). */
export async function GET(_request: Request, ctx: RouteContext<"/api/chat/conversations/[id]">) {
  return chatHandler(async (me) => {
    const id = parseId((await ctx.params).id);
    return { conversation: await getConversation(prisma, me.id, id) };
  });
}

/** სახელი (ჯგუფის შემქმნელი) და/ან mute / pin (საკუთარი). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/chat/conversations/[id]">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const id = parseId((await ctx.params).id);
    const { name, muted, pinned } = await readJson(request, updateConversationSchema);

    const renamed = await inTx(async (tx) => {
      const message = name !== undefined ? await renameGroup(tx, me.id, id, name) : null;
      if (muted !== undefined || pinned !== undefined) await updateMembership(tx, me.id, id, { muted, pinned });
      return message;
    });

    if (renamed) {
      emitConversationChanged(id);
      emitMessage("message:new", renamed);
    } else {
      emitConversationChanged(id, me.id);
    }
    return { conversation: await getConversation(prisma, me.id, id) };
  });
}

/** „საუბრის წაშლა ჩემთვის“: სიიდან და ისტორიიდან — მხოლოდ ჩემთვის (ბაზაში რჩება, სხვებს — უცვლელია). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/chat/conversations/[id]">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const id = parseId((await ctx.params).id);
    await inTx((tx) => clearConversation(tx, me.id, id));
    emitConversationHidden(me.id, id);
    return { ok: true };
  });
}
