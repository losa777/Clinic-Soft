import { emitConversationChanged, emitMessage, leaveConversation } from "@/modules/chat/realtime/emit";
import { removeMember } from "@/modules/chat/server/conversations";
import { inTx } from "@/modules/chat/server/db";
import { chatHandler, parseId, rateLimit } from "@/modules/chat/server/http";

/** მონაწილის ამოშლა (ჯგუფის შემქმნელი) ან ჯგუფიდან გასვლა (საკუთარი id). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/chat/conversations/[id]/members/[userId]">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const params = await ctx.params;
    const id = parseId(params.id);
    const userId = parseId(params.userId);
    const { message } = await inTx((tx) => removeMember(tx, me.id, id, userId));
    leaveConversation(userId, id);
    emitConversationChanged(id);
    emitMessage("message:new", message);
    return { ok: true };
  });
}
