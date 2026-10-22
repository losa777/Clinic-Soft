import { tbilisiToday } from "@/lib/appointment-slots";
import { dateParam, positiveInt } from "@/modules/finance/params";
import { apiPermission, csvResponse } from "@/modules/finance/server/csv";
import { loadDailyReport } from "@/modules/finance/server/reports";
import { paymentMethodLabel } from "@/modules/finance/types";

/** დღის ანგარიშის CSV (reports.daily): შეჯამება, სერვისები, გაუქმებული ინვოისები და დაბრუნებები (?date=&cashier=). */
export async function GET(request: Request) {
  const denied = await apiPermission("reports.daily");
  if (denied) return denied;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const date = dateParam(params.date, tbilisiToday());
  const r = await loadDailyReport(date, positiveInt(params.cashier));

  const rows: (string | number | null)[][] = [
    ["შეჯამება", "ნაღდი გადახდები", r.payments.cash, "", "", ""],
    ["შეჯამება", "ბარათით გადახდები", r.payments.card, "", "", ""],
    ["შეჯამება", "ნაღდი დაბრუნებები", r.refunds.cash, "", "", ""],
    ["შეჯამება", "ბარათით დაბრუნებები", r.refunds.card, "", "", ""],
    ["შეჯამება", "სულ შემოსავალი (წმინდა)", r.net.total, "", "", ""],
    ["შეჯამება", `ინვოისები (${r.invoices.count})`, r.invoices.total, r.invoices.insurance, r.invoices.patient, ""],
    ...r.byService.map((s) => ["სერვისი", s.name, s.total, s.insurance, s.patient, s.quantity]),
    ...r.cancelledInvoices.map((c) => ["გაუქმებული ინვოისი", `${c.number} · ${c.patient}`, c.amount, "", "", `${c.reason} (${c.by ?? "—"}, ${c.at})`]),
    ...r.refundList.map((p) => ["დაბრუნება", `${p.receipt} · ${p.invoice} · ${paymentMethodLabel(p.method)}`, p.amount, "", "", `${p.reason} (${p.by ?? "—"}, ${p.at})`]),
  ];
  return csvResponse(`daily-report-${date}.csv`, ["ტიპი", "დასახელება", "თანხა (₾)", "დაზღვევა (₾)", "პაციენტი (₾)", "შენიშვნა / რაოდენობა"], rows);
}
