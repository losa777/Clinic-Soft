import { prisma } from "@/lib/db";
import { emitMessage, emitRead } from "@/modules/chat/realtime/emit";
import { messagePageSchema, sendFormSchema, sendMessageSchema } from "@/modules/chat/schema";
import { requireMember } from "@/modules/chat/server/access";
import { discardUploads, type StoredAttachment, storeUploads } from "@/modules/chat/server/attachments";
import { ChatError } from "@/modules/chat/server/errors";
import { chatHandler, parseId, rateLimit, readJson, readQuery } from "@/modules/chat/server/http";
import { listMessages, type SendInput, sendMessageOnce } from "@/modules/chat/server/messages";

/** ისტორია ნაწილ-ნაწილ: ?before=<id> (ძველი), ?after=<id> (ახალი, ხელახლა დაკავშირებისას), ?around=<id>, ?limit. */
export async function GET(request: Request, ctx: RouteContext<"/api/chat/conversations/[id]/messages">) {
  return chatHandler(async (me) => {
    const id = parseId((await ctx.params).id);
    return listMessages(prisma, me.id, id, readQuery(request, messagePageSchema));
  });
}

/** multipart: body, replyToId, clientId + files[] (ფაილები ჯერ მოწმდება და იწერება დისკზე, შემდეგ — შეტყობინება). */
async function readForm(request: Request): Promise<SendInput> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ChatError("ფაილები ვერ მიიღო — სცადეთ თავიდან");
  }
  const text = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const fields = sendFormSchema.parse({ body: text("body"), replyToId: text("replyToId"), clientId: text("clientId") });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  return { ...fields, attachments: files.length ? await storeUploads(files) : [] };
}

/** გაგზავნა (JSON ან ფაილებით — multipart). clientId (UUID) — ხელახლა ცდისას დუბლიკატი არ იქმნება. */
export async function POST(request: Request, ctx: RouteContext<"/api/chat/conversations/[id]/messages">) {
  return chatHandler(async (me) => {
    rateLimit("send", me.id);
    const id = parseId((await ctx.params).id);
    const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
    // უცხო საუბარში ფაილი დისკზე საერთოდ არ იწერება
    if (multipart) await requireMember(prisma, me.id, id);
    const input: SendInput = multipart ? await readForm(request) : await readJson(request, sendMessageSchema);
    const uploaded: StoredAttachment[] = input.attachments ?? [];

    let result;
    try {
      result = await sendMessageOnce(me.id, id, input);
    } catch (error) {
      await discardUploads(uploaded);
      throw error;
    }
    // განმეორებითი გაგზავნა: შეტყობინება უკვე არსებობს თავისი ფაილებით — ახლად ჩაწერილი ზედმეტია
    if (result.duplicate) {
      await discardUploads(uploaded);
    } else {
      emitMessage("message:new", result.message);
      emitRead(id, me.id, result.message.id);
    }
    return { message: result.message };
  });
}
