import Link from "next/link";
import { Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type FinanceRoutes, receiptUrl } from "@/modules/finance/routes";
import { type BankOption, type InvoiceDetail, paymentMethodLabel, paymentTypeLabel, visitTypeLabel } from "@/modules/finance/types";
import { InvoiceStatusBadge, Money } from "./invoice-status-badge";
import { InvoiceActions } from "./payment-form";

/** ინვოისის ბარათი: ხაზები, ჯამები, დაზღვევა, გადახდები; მოქმედებები უფლებების მიხედვით. */
export function InvoiceView({
  invoice: i,
  routes,
  can,
  banks,
}: {
  invoice: InvoiceDetail;
  routes: FinanceRoutes;
  can: { pay: boolean; refund: boolean; cancel: boolean };
  /** აქტიური ბანკები ბარათით გადახდისთვის */
  banks: BankOption[];
}) {
  const active = i.status !== "cancelled";
  const receiptTemplate = routes.receipts ? `${routes.receipts}/{paymentId}` : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-xl font-semibold">
            ინვოისი {i.number}
            <InvoiceStatusBadge status={i.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {routes.patients ? (
              <Link href={`${routes.patients}/${i.patient.id}`} className="font-medium text-foreground hover:underline">
                {i.patient.name}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{i.patient.name}</span>
            )}{" "}
            · <span className="font-mono">{i.patient.personalId}</span>
            {i.patient.phone && ` · ${i.patient.phone}`}
          </p>
        </div>
        {active && (
          <InvoiceActions
            invoiceId={i.id}
            invoiceNumber={i.number}
            debt={i.totals.debt}
            paid={i.totals.paid}
            paidByMethod={i.paidByMethod}
            can={can}
            banks={banks}
            receiptHref={can.pay || can.refund ? receiptTemplate : null}
          />
        )}
      </div>

      {i.cancelled && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm">
          <b>გაუქმების მიზეზი:</b> {i.cancelled.reason}
          <span className="block text-xs text-muted-foreground">
            გააუქმა: {i.cancelled.by ?? "—"} · {i.cancelled.at}
          </span>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="ჯამი" value={i.totals.total} />
        <Stat label="ფასდაკლება" value={i.totals.discount} />
        <Stat label="დაზღვევის წილი" value={i.totals.insurance} />
        <Stat label="პაციენტის წილი" value={i.totals.patient} />
        <Stat label="გადახდილი" value={i.totals.paid} />
        <Stat label="დავალიანება" value={i.totals.debt} danger={Number(i.totals.debt) > 0} />
      </dl>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-normal text-muted-foreground">
            <span>მომსახურება: {i.serviceDate}</span>
            <span>{visitTypeLabel(i.visitType)}</span>
            {i.doctorName && <span>ექიმი: {i.doctorName}</span>}
            {i.appointment && <span>ჯავშანი: {i.appointment.label}</span>}
            <span>
              {i.insurance ? (
                <>
                  დაზღვევა: <b className="text-foreground">{i.insurance.companyName}</b>
                  {i.insurance.policyNumber && `, ${i.insurance.policyNumber}`}
                </>
              ) : (
                "დაზღვევის გარეშე"
              )}
              {i.insuranceDisabledReason && ` (გამორთულია: ${i.insuranceDisabledReason})`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>სერვისი</TableHead>
                <TableHead className="text-right">ფასი</TableHead>
                <TableHead className="text-right">რაოდ.</TableHead>
                <TableHead className="text-right">ფასდაკლება</TableHead>
                <TableHead className="text-right">ჯამი</TableHead>
                <TableHead className="text-right">დაზღვევა</TableHead>
                <TableHead className="text-right">პაციენტი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {i.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="whitespace-normal">
                    {it.name}
                    {it.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{it.code}</span>}
                  </TableCell>
                  <TableCell className="text-right"><Money value={it.unitPrice} /></TableCell>
                  <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                  <TableCell className="text-right">
                    {Number(it.discount) > 0 ? (
                      <>
                        <Money value={it.discount} /> <span className="text-xs text-muted-foreground">({Number(it.discountPercent)}%)</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right"><Money value={it.total} /></TableCell>
                  <TableCell className="text-right text-muted-foreground"><Money value={it.insurance} /></TableCell>
                  <TableCell className="text-right font-medium"><Money value={it.patient} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>ჯამი</TableCell>
                <TableCell className="text-right"><Money value={i.totals.total} /></TableCell>
                <TableCell className="text-right"><Money value={i.totals.insurance} /></TableCell>
                <TableCell className="text-right"><Money value={i.totals.patient} /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          {i.comment && <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-line">{i.comment}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>გადახდები</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {i.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">გადახდა ჯერ არ ყოფილა.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>ქვითარი</TableHead>
                  <TableHead>თარიღი</TableHead>
                  <TableHead>ოპერაცია</TableHead>
                  <TableHead className="text-right">თანხა</TableHead>
                  <TableHead>დეტალები</TableHead>
                  <TableHead>მოლარე</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {i.payments.map((p) => {
                  const href = receiptUrl(routes, p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.receiptNumber}</TableCell>
                      <TableCell className="tabular-nums">{p.createdAt}</TableCell>
                      <TableCell>
                        <Badge variant={p.type === "refund" ? "destructive" : "secondary"}>
                          {paymentTypeLabel(p.type)} · {paymentMethodLabel(p.method)}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", p.type === "refund" && "text-destructive")}>
                        {p.type === "refund" && "−"}
                        <Money value={p.amount} />
                      </TableCell>
                      <TableCell className="max-w-xs text-xs whitespace-normal text-muted-foreground">
                        {p.receivedAmount && p.changeAmount && Number(p.changeAmount) > 0 && (
                          <>
                            მიღებული <Money value={p.receivedAmount} />, ხურდა <Money value={p.changeAmount} />
                          </>
                        )}
                        {p.bank && <span className="font-medium text-foreground">{p.bank} </span>}
                        {p.cardReference && `ტრანზაქცია: ${p.cardReference}`}
                        {p.reason && ` ${p.reason}`}
                      </TableCell>
                      <TableCell className="text-xs">{p.createdBy ?? "—"}</TableCell>
                      <TableCell>
                        {href && (can.pay || can.refund) && (
                          <Link href={href} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="ქვითრის ბეჭდვა" title="ქვითრის ბეჭდვა">
                            <Printer />
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            შექმნა: {i.createdBy ?? "—"} · {i.createdAt}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card size="sm">
      <CardContent>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={cn("text-lg font-semibold", danger && "text-destructive")}>
          <Money value={value} />
        </dd>
      </CardContent>
    </Card>
  );
}
