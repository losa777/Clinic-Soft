import { auth } from "@/auth";
import { isImageMime } from "@/modules/chat/files";
import { issueUser } from "@/modules/issues/server/access";
import { readIssueFile } from "@/modules/issues/server/files";

/**
 * ბილეთის ფაილის ჩვენება/ჩამოტვირთვა — მხოლოდ მას, ვინც ბილეთს ხედავს (სესია და ხილვადობა მოწმდება, საჯარო ბმული არ არის).
 * სურათი და PDF იხსნება ბრაუზერში (?download — ჩამოტვირთვა), დანარჩენი ყოველთვის ჩამოიტვირთება.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/issues/attachments/[id]">) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "ავტორიზაცია საჭიროა" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const file = Number.isSafeInteger(id) && id > 0 ? await readIssueFile(await issueUser(session.user), id) : null;
  if (!file) return Response.json({ error: "ფაილი ვერ მოიძებნა" }, { status: 404 });

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
}
