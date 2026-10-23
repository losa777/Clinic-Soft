import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { documentUrl } from "@/lib/patient-schema";
import { can } from "@/lib/permissions";
import { renderDocumentPdf } from "@/modules/emr/documents/pdf";
import { loadPdfInput } from "@/modules/emr/server/documents";

/**
 * სამედიცინო დოკუმენტის PDF: დრაფტი — „დრაფტი“ წყალნიშნით, ყოველ ჯერზე ხელახლა (არ ინახება);
 * ხელმოწერილი — გადამისამართება შენახულ (ჩაკეტილ) PDF-ზე. წვდომა — emr.view.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/medical-documents/[id]/preview">) {
  const session = await auth();
  if (!session?.user) return new Response("ავტორიზაცია საჭიროა", { status: 401 });
  if (!can(session.user, "emr.view")) return new Response("წვდომა აკრძალულია", { status: 403 });

  const id = Number((await ctx.params).id);
  const doc = Number.isInteger(id) && id > 0 ? await prisma.medicalDocument.findUnique({ where: { id }, select: { status: true, pdfDocumentId: true } }) : null;
  if (!doc) return new Response("დოკუმენტი ვერ მოიძებნა", { status: 404 });
  if (doc.status !== "draft" && doc.pdfDocumentId) {
    return new Response(null, { status: 303, headers: { Location: documentUrl(doc.pdfDocumentId) } });
  }

  const input = await loadPdfInput(prisma, id, { withStamp: true });
  if (!input) return new Response("დოკუმენტი ვერ მოიძებნა", { status: 404 });
  const pdf = await renderDocumentPdf({ ...input, draft: true, signatures: [] });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="draft-${id}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
