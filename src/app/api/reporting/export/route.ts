import { auth } from "@/auth";
import { tbilisiToday } from "@/lib/appointment-slots";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { buildXlsx } from "@/lib/xlsx";
import { columnOf } from "@/modules/reporting/columns";
import { parseFilter } from "@/modules/reporting/filter";
import { seesAllPatients } from "@/modules/reporting/server/access";
import { EXPORT_MAX_ROWS, loadReportRows } from "@/modules/reporting/server/rows";
import { loadColumns } from "@/modules/reporting/server/templates";

/**
 * ანგარიშგების Excel (.xlsx): ?ids= — მთავარ გვერდზე მონიშნული ვიზიტები, სხვაგვარად — ფილტრით (ექსპორტის გვერდი).
 * სვეტები — მომხმარებლის შენახული არჩევანი. ჯანმრთელობის პერსონალური მონაცემია: სესია და უფლება აქ მოწმდება,
 * ყოველი ექსპორტი აუდიტში იწერება (ფილტრი/მონიშნულები, სვეტები, რაოდენობა).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "ავტორიზაცია საჭიროა" }, { status: 401 });
  const user = session.user;
  if (!can(user, "reporting.view") || !can(user, "reporting.export")) return Response.json({ error: "წვდომა აკრძალულია" }, { status: 403 });

  const url = new URL(request.url);
  const filter = parseFilter(Object.fromEntries(url.searchParams.entries()), seesAllPatients(user));
  const columns = await loadColumns(Number(user.id));
  const { rows, total } = await loadReportRows(filter, EXPORT_MAX_ROWS);
  if (!rows.length) return Response.json({ error: "ექსპორტისთვის ჩანაწერი არ არის" }, { status: 404 });

  const file = buildXlsx(
    filter.scope === "surgical" ? "საოპერაციო" : "ვიზიტები",
    columns.map((c) => ({ header: columnOf(c).label, width: columnOf(c).width })),
    rows.map((r) => columns.map((c) => r[c])),
  );
  await audit({
    userId: Number(user.id),
    action: "export",
    entity: "report",
    details: `${rows.length}/${total} ხაზი · ${filter.ids ? `მონიშნული (${filter.ids.length})` : `${filter.from}–${filter.to} · ${filter.portal}`} · ${filter.scope} · სვეტები: ${columns.join(",")}`,
  });

  const name = filter.ids ? `report-selected-${tbilisiToday()}.xlsx` : `report-${filter.from}_${filter.to}-${tbilisiToday()}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
