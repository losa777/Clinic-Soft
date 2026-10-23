import { auth } from "@/auth";
import { loadNotifications } from "@/lib/notifications";

/** მიმდინარე მომხმარებლის შეტყობინებები (ზარის polling). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "ავტორიზაცია საჭიროა" }, { status: 401 });
  const data = await loadNotifications(Number(session.user.id));
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
