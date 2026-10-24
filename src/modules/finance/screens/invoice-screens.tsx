import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Session } from "next-auth";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/appointment-slots";
import { can } from "@/lib/permissions";
import { DebtBadge } from "@/modules/finance/components/invoice-status-badge";
import { FilterBar, FilterField, DateInput, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { InvoiceForm } from "@/modules/finance/components/invoice-form";
import { InvoiceList } from "@/modules/finance/components/invoice-list";
import { InvoiceView } from "@/modules/finance/components/invoice-view";
import { param, periodParams, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { type FinanceRoutes, invoiceUrl } from "@/modules/finance/routes";
import { listInvoices, loadInvoiceDetail, loadInvoiceFormData } from "@/modules/finance/server/invoices";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/modules/finance/types";
import { LiveRefresh } from "@/components/live-refresh";

type User = Session["user"];

/** ინვოისების სია: პერიოდი, სტატუსი, ძებნა ინვოისის ან პირადი ნომრით; გვერდებად. */
export async function InvoicesScreen({ routes, params }: { routes: FinanceRoutes; params: SearchParams }) {
  const { from, to } = periodParams(params, 7);
  const status = INVOICE_STATUSES.some((s) => s.value === param(params.status)) ? (param(params.status) as InvoiceStatus) : null;
  const query = param(params.q);
  const page = positiveInt(params.page) ?? 1;
  const result = await listInvoices({ from, to, status, query, page });

  return (
    <section className="flex flex-col gap-4">
      <LiveRefresh topics={["invoices"]} />
      <div>
        <h1 className="text-xl font-semibold">ინვოისები</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(from)} — {formatDate(to)} · სულ: {result.total}. ახალი ინვოისი იქმნება პაციენტის ბარათიდან ან ჯავშნიდან.
        </p>
      </div>
      <FilterBar action={routes.invoices}>
        <FilterField label="დან">
          <DateInput name="from" value={from} />
        </FilterField>
        <FilterField label="მდე">
          <DateInput name="to" value={to} />
        </FilterField>
        <FilterField label="სტატუსი">
          <NativeSelect name="status" value={status ?? ""} options={[{ value: "", label: "ყველა" }, ...INVOICE_STATUSES]} />
        </FilterField>
        <FilterField label="ინვოისის ან პირადი ნომერი">
          <Input name="q" defaultValue={query} placeholder="INV-2026-000001 / 01001012345" className="h-9 w-64" />
        </FilterField>
      </FilterBar>
      <InvoiceList rows={result.rows} href={(id) => invoiceUrl(routes, id)} />
      <Pager
        page={result.page}
        pageCount={result.pageCount}
        href={(p) => withParams(routes.invoices, { from, to, status, q: query, page: p })}
      />
    </section>
  );
}

/** ახალი ინვოისი: ?patientId= ან ?appointmentId= (ჯავშნიდან — ექიმი და კონსულტაცია ავტომატურად). */
export async function NewInvoiceScreen({ routes, params }: { routes: FinanceRoutes; params: SearchParams }) {
  const data = await loadInvoiceFormData({ patientId: positiveInt(params.patientId), appointmentId: positiveInt(params.appointmentId) });
  if (!data) notFound();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {routes.patients && (
          <Link
            href={`${routes.patients}/${data.patient.id}?tab=invoices`}
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            პაციენტის ბარათი
          </Link>
        )}
        <h1 className="flex flex-wrap items-center gap-3 text-xl font-semibold">
          ახალი ინვოისი
          <DebtBadge debt={data.patient.debt} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.patient.name} · <span className="font-mono tracking-wider">{data.patient.personalId}</span>
        </p>
      </div>
      <InvoiceForm key={`${data.patient.id}-${data.appointment?.id ?? ""}`} data={data} routes={routes} />
    </section>
  );
}

export async function InvoiceScreen({ routes, rawId, user }: { routes: FinanceRoutes; rawId: string; user: User }) {
  const id = Number(rawId);
  const invoice = Number.isInteger(id) && id > 0 ? await loadInvoiceDetail(id) : null;
  if (!invoice) notFound();

  return (
    <section className="flex flex-col gap-2">
      <LiveRefresh topics={["invoices"]} />
      <Link href={routes.invoices} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" />
        ინვოისები
      </Link>
      <InvoiceView
        invoice={invoice}
        routes={routes}
        can={{
          pay: can(user, "payments.create") && routes.receipts !== null,
          refund: can(user, "payments.refund"),
          cancel: can(user, "invoices.cancel"),
        }}
      />
    </section>
  );
}
