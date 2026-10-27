import { emitConversationChanged, emitMessage, joinConversation } from "@/modules/chat/realtime/emit";
import { createDirect, createSystemMessage, directKey } from "@/modules/chat/server/core";
import { inTx } from "@/modules/chat/server/db";
import type { SystemEvent } from "@/modules/chat/types";

/**
 * ზარის ისტორია: ორი თანამშრომლის პირად საუბარში სისტემური შეტყობინება (ავტორი — დამრეკი). საუბარი თუ ჯერ არ
 * არსებობს — იქმნება. შეცდომა ზარს არ აფერხებს — მხოლოდ ლოგში იწერება.
 */
export async function recordCall(callerId: number, calleeId: number, event: SystemEvent, seconds?: number) {
  try {
    const { conversationId, created, message } = await inTx(async (tx) => {
      const existing = await tx.conversation.findUnique({ where: { directKey: directKey(callerId, calleeId) }, select: { id: true } });
      const id = existing?.id ?? (await createDirect(tx, callerId, calleeId));
      const body = seconds === undefined ? undefined : String(seconds);
      return { conversationId: id, created: !existing, message: await createSystemMessage(tx, id, callerId, event, { targetUserId: calleeId, body }) };
    });
    if (created) {
      joinConversation([callerId, calleeId], conversationId);
      emitConversationChanged(conversationId);
    }
    emitMessage("message:new", message);
  } catch (error) {
    console.error("ზარი: ისტორიაში ვერ ჩაიწერა:", callerId, calleeId, event, error);
  }
}
