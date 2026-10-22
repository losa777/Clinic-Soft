import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import { Input } from "@/components/ui/input";
import { formatDate, tbilisiToday, weekdayName } from "@/lib/appointment-slots";
import { CashShiftPanel } from "@/modules/finance/components/cash-shift-panel";
import { DailyReport } from "@/modules/finance/components/daily-report";
import { DebtList, InsurerDebtList } from "@/modules/finance/components/debt-list";
import { DateInput, ExportLink, FilterBar, FilterField, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { PrintButton } from "@/modules/finance/components/print-button";
import { ReceiptPrint } from "@/modules/finance/components/receipt-print";
import { dateParam, param, periodParams, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { type FinanceRoutes, invoiceUrl } from "@/modules/finance/routes";
import { loadOpenShift, loadRecentShifts } from "@/modules/finance/server/cash";
import { insurerDebts, listDebts } from "@/modules/finance/server/debts";
import { prisma } from "@/lib/db";
import { loadReceipt } from "@/modules/finance/server/receipts";
import { loadCashiers, loadDailyReport } from "@/modules/finance/server/reports";

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
