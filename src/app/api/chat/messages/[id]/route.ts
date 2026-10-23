import { emitMessage } from "@/modules/chat/realtime/emit";
import { editMessageSchema } from "@/modules/chat/schema";
import { inTx } from "@/modules/chat/server/db";
import { chatHandler, parseId, rateLimit, readJson } from "@/modules/chat/server/http";
import { deleteMessage, editMessage } from "@/modules/chat/server/messages";

/** საკუთარი შეტყობინების რედაქტირება (ძველი ტექსტი ისტორიაში ინახება). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/chat/messages/[id]">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const id = parseId((await ctx.params).id);
    const { body } = await readJson(request, editMessageSchema);
    const message = await inTx((tx) => editMessage(tx, me.id, id, body));
    emitMessage("message:updated", message);
    return { message };
  });
}

/** საკუთარი შეტყობინების წაშლა (soft delete — „შეტყობინება წაიშალა“). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/chat/messages/[id]">) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const id = parseId((await ctx.params).id);
    const message = await inTx((tx) => deleteMessage(tx, me.id, id));
    emitMessage("message:updated", message);
    return { message };
  });
}
