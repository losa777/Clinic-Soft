import { periodParams } from "@/modules/finance/params";
import { apiPermission, csvResponse } from "@/modules/finance/server/csv";
import { exportDebts } from "@/modules/finance/server/debts";

/** დავალიანებების CSV (reports.debts): იგივე ფილტრები, რაც გვერდზე (?from=&to=&min=). */
export async function GET(request: Request) {
  const denied = await apiPermission("reports.debts");
  if (denied) return denied;

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
  const hasPeriod = Boolean(params.from || params.to);
  const period = periodParams(params, 30);
  const min = /^\d{1,10}([.,]\d{1,2})?$/.test(params.min ?? "") ? params.min.replace(",", ".") : "";

  const rows = await exportDebts({ from: hasPeriod ? period.from : null, to: hasPeriod ? period.to : null, minAmount: min, page: 1 });
  return csvResponse(
    `debts-${period.to}.csv`,
    ["პაციენტი", "პირადი ნომერი", "ტელეფონი", "ღია ინვოისი", "უძველესი ინვოისი", "ვალი (₾)"],
    rows.map((r) => [r.name, r.personalId, r.phone, r.invoices, r.oldest, r.debt]),
  );
}
