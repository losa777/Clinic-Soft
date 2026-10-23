import { prisma } from "@/lib/db";
import { emitConversationChanged, emitMessage, joinConversation } from "@/modules/chat/realtime/emit";
import { createConversationSchema } from "@/modules/chat/schema";
import { createGroup, listConversations, openDirectOnce } from "@/modules/chat/server/conversations";
import { inTx } from "@/modules/chat/server/db";
import { chatHandler, rateLimit, readJson } from "@/modules/chat/server/http";

/** ჩემი საუბრები (ჩამაგრებული პირველი, შემდეგ ბოლო შეტყობინების დროით) — წაუკითხავებითა და ბოლო ნაწყვეტით. */
export async function GET() {
  return chatHandler(async (me) => ({ conversations: await listConversations(prisma, me.id) }));
}

/** ახალი საუბარი: პირადი (არსებულს აბრუნებს, თუ უკვე არის) ან ჯგუფი. */
export async function POST(request: Request) {
  return chatHandler(async (me) => {
    rateLimit("mutate", me.id);
    const input = await readJson(request, createConversationSchema);

    if (input.type === "direct") {
      const { conversationId, created } = await openDirectOnce(me.id, input.userId);
      if (created) {
        joinConversation([me.id, input.userId], conversationId);
        emitConversationChanged(conversationId, me.id);
      }
      return { conversationId };
    }

    const group = await inTx((tx) => createGroup(tx, me.id, input.name, input.memberIds));
    joinConversation(group.memberIds, group.conversationId);
    emitConversationChanged(group.conversationId);
    emitMessage("message:new", group.message);
    return { conversationId: group.conversationId };
  });
}
