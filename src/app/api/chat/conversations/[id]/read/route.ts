import { emitRead } from "@/modules/chat/realtime/emit";
import { markReadSchema } from "@/modules/chat/schema";
import { inTx } from "@/modules/chat/server/db";
import { chatHandler, parseId, readJson } from "@/modules/chat/server/http";
import { markRead } from "@/modules/chat/server/messages";

/** წაკითხულად მონიშვნა messageId-მდე (✓✓, წაუკითხავების რაოდენობა — სხვა ტაბებშიც). */
export async function POST(request: Request, ctx: RouteContext<"/api/chat/conversations/[id]/read">) {
  return chatHandler(async (me) => {
    const id = parseId((await ctx.params).id);
    const { messageId } = await readJson(request, markReadSchema);
    const result = await inTx((tx) => markRead(tx, me.id, id, messageId));
    if (result.changed) emitRead(id, me.id, result.lastReadMessageId);
    return { lastReadMessageId: result.lastReadMessageId };
  });
}
