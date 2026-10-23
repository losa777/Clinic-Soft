import { emitConversationChanged, emitMessage, joinConversation } from "@/modules/chat/realtime/emit";
import { addMembersSchema } from "@/modules/chat/schema";
import { addMembers } from "@/modules/chat/server/conversations";
import { inTx } from "@/modules/chat/server/db";
import { chatHandler, parseId, rateLimit, readJson } from "@/modules/chat/server/http";

/** ჯგუფში მონაწილეების დამატება (მხოლოდ შემქმნელი). */
export async function POST(request: Request, ctx: RouteContext<"/api/chat/conversations/[id]/members">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const id = parseId((await ctx.params).id);
    const { userIds } = await readJson(request, addMembersSchema);
    const { added, messages } = await inTx((tx) => addMembers(tx, me.id, id, userIds));
    if (added.length) {
      joinConversation(added, id);
      emitConversationChanged(id);
      for (const m of messages) emitMessage("message:new", m);
    }
    return { added };
  });
}
