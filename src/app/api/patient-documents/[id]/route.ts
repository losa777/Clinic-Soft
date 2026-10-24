import { auth } from "@/auth";
import { auditOnce } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { readDocument } from "@/lib/document-storage";
import { can } from "@/lib/permissions";
import { hasRole, PATIENT_ROLES } from "@/lib/roles";

/**
 * პაციენტის დოკუმენტის ჩვენება/ჩამოტვირთვა. ფაილები ჯანმრთელობის პერსონალური მონაცემია:
 * სესია და როლი აქ მოწმდება (proxy /api/*-ს არ ამოწმებს), პასუხი არ ქეშირდება.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/patient-documents/[id]">) {
  const session = await auth();
  if (!session?.user) return new Response("ავტორიზაცია საჭიროა", { status: 401 });
  // რეგისტრატურა/ადმინი, ექიმი (სამედიცინო ჩანაწერი) და ლაბორანტი (კვლევის შედეგი)
  const allowed =
    hasRole(session.user, ...PATIENT_ROLES) || can(session.user, "emr.view") || can(session.user, "orders.lab");
  if (!allowed) return new Response("წვდომა აკრძალულია", { status: 403 });

  const id = Number((await ctx.params).id);
  const doc = Number.isInteger(id) ? await prisma.patientDocument.findUnique({ where: { id } }) : null;
  if (!doc) return new Response("დოკუმენტი ვერ მოიძებნა", { status: 404 });
  await auditOnce({ userId: Number(session.user.id), action: "view", entity: "patient_document", entityId: doc.id, patientId: doc.patientId, details: doc.originalName });

  let file: Buffer;
  try {
    file = await readDocument(doc.storagePath);
  } catch (error) {
    console.error("დოკუმენტის ფაილი ვერ წაიკითხა:", doc.id, error);
    return new Response("ფაილი ვერ მოიძებნა", { status: 404 });
  }

  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // PDF-ს ბრაუზერის ჩაშენებული viewer აჩვენებს — მკაცრი CSP მას ხელს უშლის
      ...(doc.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'" }),
    },
  });
}
