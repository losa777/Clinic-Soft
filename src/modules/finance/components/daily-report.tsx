import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DailyReport as Report } from "@/modules/finance/server/reports";
import { paymentMethodLabel } from "@/modules/finance/types";
import { Money } from "./invoice-status-badge";

/** დღის ანგარიში: გადახდები მეთოდებით, დაბრუნებები, ინვოისები და დაზღვევა, სერვისების მიხედვით, გაუქმებული ოპერაციები. */
export function DailyReport({ report: r, title }: { report: Report; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="hidden text-lg font-semibold print:block">{title}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ნაღდი (წმინდა)" value={r.net.cash} hint={`გადახდა ${r.payments.cash} − დაბრუნება ${r.refunds.cash}`} />
        <Stat label="ბარათი (წმინდა)" value={r.net.card} hint={`გადახდა ${r.payments.card} − დაბრუნება ${r.refunds.card}`} />
        <Stat label="დაბრუნებები" value={r.refunds.total} hint={`ოპერაცია: ${r.refunds.count}`} danger={Number(r.refunds.total) > 0} />
        <Stat label="სულ შემოსავალი" value={r.net.total} hint={`გადახდა: ${r.payments.count}`} strong />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`ინვოისი (${r.invoices.count})`} value={r.invoices.total} hint="გაუქმებულის გარეშე" />
        <Stat label="ფასდაკლება" value={r.invoices.discount} />
        <Stat label="დაზღვევის წილი" value={r.invoices.insurance} />
        <Stat label="პაციენტის წილი" value={r.invoices.patient} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>სერვისების მიხედვით</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>სერვისი</TableHead>
                <TableHead className="text-right">რაოდ.</TableHead>
                <TableHead className="text-right">ჯამი</TableHead>
                <TableHead className="text-right">დაზღვევა</TableHead>
                <TableHead className="text-right">პაციენტი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.byService.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                    ამ დღეს ინვოისი არ არის
                  </TableCell>
                </TableRow>
              )}
              {r.byService.map((s, n) => (
                <TableRow key={`${s.serviceId}-${n}`}>
                  <TableCell className="whitespace-normal">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.quantity}</TableCell>
                  <TableCell className="text-right"><Money value={s.total} /></TableCell>
                  <TableCell className="text-right"><Money value={s.insurance} /></TableCell>
                  <TableCell className="text-right"><Money value={s.patient} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>გაუქმებული ინვოისები ({r.cancelledInvoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {r.cancelledInvoices.length === 0 && <p className="text-muted-foreground">არ არის</p>}
            {r.cancelledInvoices.map((c) => (
              <div key={c.id} className="rounded-lg border px-3 py-2">
                <p className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{c.number}</span>
                  <Money value={c.amount} />
                </p>
                <p>{c.patient}</p>
                <p className="text-xs text-muted-foreground">
                  {c.reason} · {c.by ?? "—"}, {c.at}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>დაბრუნებები ({r.refundList.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {r.refundList.length === 0 && <p className="text-muted-foreground">არ არის</p>}
            {r.refundList.map((p) => (
              <div key={p.id} className="rounded-lg border px-3 py-2">
                <p className="flex justify-between gap-2">
                  <span className="font-mono text-xs">
                    {p.receipt} · {p.invoice}
                  </span>
                  <span className="text-destructive">
                    −<Money value={p.amount} /> ({paymentMethodLabel(p.method)})
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.reason} · {p.by ?? "—"}, {p.at}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, danger, strong }: { label: string; value: string; hint?: string; danger?: boolean; strong?: boolean }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-xl font-semibold", danger && "text-destructive", strong && "text-primary")}>
          <Money value={value} />
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
