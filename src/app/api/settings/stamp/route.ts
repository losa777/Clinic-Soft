import { auth } from "@/auth";
import { readDocument } from "@/lib/document-storage";
import { can } from "@/lib/permissions";
import { loadStampPath } from "@/modules/finance/server/stamp";

/** კლინიკის ბეჭდის სურათი (რეკვიზიტების გვერდზე და დოკუმენტის ხელმოწერისას სანახავად). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("ავტორიზაცია საჭიროა", { status: 401 });
  if (session.user.roleCode !== "admin" && !can(session.user, "documents.sign")) return new Response("წვდომა აკრძალულია", { status: 403 });
  const path = await loadStampPath();
  if (!path) return new Response("ბეჭედი ატვირთული არ არის", { status: 404 });
  try {
    const file = await readDocument(path);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("ფაილი ვერ მოიძებნა", { status: 404 });
  }
}
