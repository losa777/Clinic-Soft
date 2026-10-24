import { periodParams } from "@/modules/finance/params";
import { loadDoctors, loadServices } from "@/modules/finance/server/analytics";
import { apiPermission, csvResponse } from "@/modules/finance/server/csv";

/** ფინანსური ანალიზის CSV (reports.finance): ?from=&to=&section=doctors|services. */
export async function GET(request: Request) {
  const denied = await apiPermission("reports.finance");
  if (denied) return denied;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { from, to } = periodParams(params, 30);

  if (params.section === "services") {
    const rows = await loadServices(from, to);
    return csvResponse(
      `services-${from}-${to}.csv`,
      ["სერვისი", "კატეგორია", "რაოდენობა", "დარიცხული (₾)"],
      rows.map((s) => [s.name, s.category, s.quantity, s.total]),
    );
  }
  const rows = await loadDoctors(from, to);
  return csvResponse(
    `doctors-${from}-${to}.csv`,
    ["ექიმი", "ინვოისი", "პაციენტი", "დარიცხული (₾)", "დაზღვევა (₾)", "პაციენტის წილი (₾)", "საშუალო ინვოისი (₾)"],
    rows.map((d) => [d.name, d.invoices, d.patients, d.total, d.insurance, d.patient, d.average]),
  );
}
