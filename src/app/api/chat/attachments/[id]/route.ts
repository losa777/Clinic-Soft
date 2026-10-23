import { prisma } from "@/lib/db";
import { isImageMime } from "@/modules/chat/files";
import { readAttachment } from "@/modules/chat/server/attachments";
import { chatHandler, parseId } from "@/modules/chat/server/http";

/**
 * ჩატის ფაილის ჩვენება/ჩამოტვირთვა — მხოლოდ საუბრის მონაწილეს (სესია და წევრობა მოწმდება, საჯარო ბმული არ არის).
 * სურათი და PDF იხსნება ბრაუზერში (?download — ჩამოტვირთვა), დანარჩენი ყოველთვის ჩამოიტვირთება.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/chat/attachments/[id]">) {
  return chatHandler(async (me) => {
    const file = await readAttachment(prisma, me.id, parseId((await ctx.params).id));
    const inline = !new URL(request.url).searchParams.has("download") && (isImageMime(file.mimeType) || file.mimeType === "application/pdf");
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // PDF-ს ბრაუზერის ჩაშენებული viewer აჩვენებს — მკაცრი CSP მას ხელს უშლის
        ...(file.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox" }),
      },
    });
  });
}
