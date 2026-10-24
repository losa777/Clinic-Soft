import Link from "next/link";
import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import { Input } from "@/components/ui/input";
import { addDays, formatDate, tbilisiToday, weekdayName } from "@/lib/appointment-slots";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { AnalyticsReport } from "@/modules/finance/components/analytics-report";
import { CashShiftPanel } from "@/modules/finance/components/cash-shift-panel";
import { DailyReport } from "@/modules/finance/components/daily-report";
import { DebtList, InsurerDebtList } from "@/modules/finance/components/debt-list";
import { DateInput, ExportLink, FilterBar, FilterField, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { PrintButton } from "@/modules/finance/components/print-button";
import { ReceiptPrint } from "@/modules/finance/components/receipt-print";
import { dateParam, param, periodParams, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { type FinanceRoutes, invoiceUrl } from "@/modules/finance/routes";
import { loadAnalytics } from "@/modules/finance/server/analytics";
import { loadOpenShift, loadRecentShifts } from "@/modules/finance/server/cash";
import { insurerDebts, listDebts } from "@/modules/finance/server/debts";
import { prisma } from "@/lib/db";
import { loadReceipt } from "@/modules/finance/server/receipts";
import { loadCashiers, loadDailyReport } from "@/modules/finance/server/reports";
import { LiveRefresh } from "@/components/live-refresh";

type User = Session["user"];

const MIN_AMOUNT = /^\d{1,10}([.,]\d{1,2})?$/;

/** დავალიანებები: პაციენტები (ფილტრი: ინვოისის პერიოდი, მინ. თანხა; გვერდები; CSV) და სადაზღვევოები პერიოდში. */
export async function DebtsScreen({ routes, params }: { routes: FinanceRoutes; params: SearchParams }) {
  // პაციენტების ვალზე პერიოდი არასავალდებულოა (ნაგულისხმევად — ყველა ღია ინვოისი)
  const hasPeriod = Boolean(param(params.from) || param(params.to));
  const period = periodParams(params, 30);
  const min = MIN_AMOUNT.test(param(params.min)) ? param(params.min).replace(",", ".") : "";
  const page = positiveInt(params.page) ?? 1;
  const filter = { from: hasPeriod ? period.from : null, to: hasPeriod ? period.to : null, minAmount: min, page };
  const [debts, insurers] = await Promise.all([listDebts(filter), insurerDebts(period.from, period.to)]);
  const query = { from: hasPeriod ? period.from : null, to: hasPeriod ? period.to : null, min };

  return (
    <section className="flex flex-col gap-4">
      <LiveRefresh topics={["invoices"]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">დავალიანებები</h1>
          <p className="text-sm text-muted-foreground">
            პაციენტის ვალი = გადაუხდელი პაციენტის წილი ღია ინვოისებზე{hasPeriod && ` (ინვოისები ${formatDate(period.from)} — ${formatDate(period.to)})`}
          </p>
        </div>
        <ExportLink href={withParams("/api/finance/debts", query)} />
      </div>
      <FilterBar action={routes.debts}>
        <FilterField label="ინვოისი დან">
          <DateInput name="from" value={hasPeriod ? period.from : ""} />
        </FilterField>
        <FilterField label="მდე">
          <DateInput name="to" value={hasPeriod ? period.to : ""} />
        </FilterField>
        <FilterField label="მინიმალური ვალი (₾)">
          <Input name="min" defaultValue={min} inputMode="decimal" placeholder="0" className="h-9 w-36" />
        </FilterField>
      </FilterBar>
      <DebtList
        rows={debts.rows}
        patients={debts.patients}
        total={debts.total}
        patientHref={routes.patients ? (id) => `${routes.patients}/${id}?tab=invoices` : null}
      />
      <Pager page={debts.page} pageCount={debts.pageCount} href={(p) => withParams(routes.debts, { ...query, page: p })} />
      <InsurerDebtList rows={insurers} period={`${formatDate(period.from)} — ${formatDate(period.to)}`} />
    </section>
  );
}

/** დღის ანგარიში: თარიღი და მოლარე; დასაბეჭდი და CSV. */
export async function ReportsScreen({ routes, params }: { routes: FinanceRoutes; params: SearchParams }) {
  const date = dateParam(params.date, tbilisiToday());
  const cashierId = positiveInt(params.cashier);
  const [report, cashiers] = await Promise.all([loadDailyReport(date, cashierId), loadCashiers()]);
  const cashier = cashiers.find((c) => c.id === cashierId);
  const title = `დღის ანგარიში — ${formatDate(date)}, ${weekdayName(date)}${cashier ? ` · მოლარე: ${cashier.name}` : ""}`;

  return (
    <section className="flex flex-col gap-4">
      <LiveRefresh topics={["invoices"]} />
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">დღის ანგარიში</h1>
          <p className="text-sm text-muted-foreground">{title.replace("დღის ანგარიში — ", "")}</p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportLink href={withParams("/api/finance/daily-report", { date, cashier: cashierId })} />
        </div>
      </div>
      <FilterBar action={routes.reports}>
        <FilterField label="თარიღი">
          <DateInput name="date" value={date} />
        </FilterField>
        <FilterField label="მოლარე">
          <NativeSelect
            name="cashier"
            value={cashierId ? String(cashierId) : ""}
            options={[{ value: "", label: "ყველა" }, ...cashiers.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
        </FilterField>
      </FilterBar>
      <DailyReport report={report} title={title} />
    </section>
  );
}

/** სალარო: მიმდინარე მომხმარებლის ცვლა. */
export async function CashScreen({ user }: { user: User }) {
  const [shift, recent] = await Promise.all([loadOpenShift(Number(user.id)), loadRecentShifts(Number(user.id))]);
  return (
    <section className="flex flex-col gap-4">
      <LiveRefresh topics={["invoices"]} />
      <div>
        <h1 className="text-xl font-semibold">სალარო</h1>
        <p className="text-sm text-muted-foreground">ნაღდი გადახდის მიღება და დაბრუნება შეიძლება მხოლოდ ღია ცვლით.</p>
      </div>
      <CashShiftPanel shift={shift} recent={recent} />
    </section>
  );
}

export async function ReceiptScreen({ routes, rawId }: { routes: FinanceRoutes; rawId: string }) {
  const id = Number(rawId);
  const receipt = Number.isInteger(id) && id > 0 ? await loadReceipt(id) : null;
  if (!receipt) notFound();
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id }, select: { invoiceId: true } });
  return <ReceiptPrint data={receipt} paymentId={id} backHref={invoiceUrl(routes, payment.invoiceId)} />;
}

/** სწრაფი პერიოდები (ბმულები — ფილტრი URL-შია). */
function analyticsPresets(today: string) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthEnd = addDays(monthStart, -1);
  return [
    { label: "ეს თვე", from: monthStart, to: today },
    { label: "წინა თვე", from: `${prevMonthEnd.slice(0, 7)}-01`, to: prevMonthEnd },
    { label: "ბოლო 30 დღე", from: addDays(today, -29), to: today },
    { label: "ბოლო 3 თვე", from: addDays(today, -89), to: today },
    { label: "ეს წელი", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

/** ფინანსური ანალიზი (reports.finance): პერიოდი (ნაგულისხმევად — მიმდინარე თვე), შედარება წინასთან, დინამიკა, ჭრილები. */
export async function AnalyticsScreen({ routes, user, params }: { routes: FinanceRoutes; user: User; params: SearchParams }) {
  const base = routes.analytics;
  if (!base) notFound();
  const today = tbilisiToday();
  const presets = analyticsPresets(today);
  const hasPeriod = Boolean(param(params.from) || param(params.to));
  const period = hasPeriod ? periodParams(params, 30) : { from: presets[0].from, to: presets[0].to };
  const a = await loadAnalytics(period.from, period.to, { withInventory: can(user, "inventory.reports") });
  const title = `ფინანსური ანალიზი — ${formatDate(period.from)} — ${formatDate(period.to)}`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">ფინანსური ანალიზი</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(period.from)} — {formatDate(period.to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <ExportLink href={withParams("/api/finance/analytics", { from: period.from, to: period.to, section: "doctors" })} label="ექიმები (CSV)" />
          <ExportLink href={withParams("/api/finance/analytics", { from: period.from, to: period.to, section: "services" })} label="სერვისები (CSV)" />
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 print:hidden" aria-label="პერიოდი">
        {presets.map((p) => {
          const active = p.from === period.from && p.to === period.to;
          return (
            <Link
              key={p.label}
              href={withParams(base, { from: p.from, to: p.to })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
      <FilterBar action={base}>
        <FilterField label="დან">
          <DateInput name="from" value={period.from} />
        </FilterField>
        <FilterField label="მდე">
          <DateInput name="to" value={period.to} />
        </FilterField>
      </FilterBar>
      <h2 className="hidden text-lg font-semibold print:block">{title}</h2>
      <AnalyticsReport a={a} />
    </section>
  );
}
