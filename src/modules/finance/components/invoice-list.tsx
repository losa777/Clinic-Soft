import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { InvoiceListRow } from "@/modules/finance/types";
import { InvoiceStatusBadge, Money } from "./invoice-status-badge";

/** ინვოისების ცხრილი (სიის გვერდი, პაციენტის ბარათი). href — ინვოისის გვერდი; null — ბმულის გარეშე. */
export function InvoiceList({
  rows,
  href,
  showPatient = true,
  emptyText = "ინვოისები ვერ მოიძებნა",
}: {
  rows: InvoiceListRow[];
  href: ((id: number) => string) | null;
  showPatient?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-10">ინვოისი</TableHead>
            <TableHead className="h-10">თარიღი</TableHead>
            {showPatient && <TableHead className="h-10">პაციენტი</TableHead>}
            <TableHead className="h-10">სტატუსი</TableHead>
            <TableHead className="h-10 text-right">ჯამი</TableHead>
            <TableHead className="hidden h-10 text-right md:table-cell">დაზღვევა</TableHead>
            <TableHead className="h-10 text-right">პაციენტის წილი</TableHead>
            <TableHead className="hidden h-10 text-right md:table-cell">გადახდილი</TableHead>
            <TableHead className="h-10 text-right">ვალი</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showPatient ? 9 : 8} className="h-20 text-center text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id} className={cn(r.status === "cancelled" && "text-muted-foreground")}>
              <TableCell className="font-mono text-xs">
                {href ? (
                  <Link href={href(r.id)} className="font-medium text-primary hover:underline">
                    {r.number}
                  </Link>
                ) : (
                  r.number
                )}
              </TableCell>
              <TableCell className="tabular-nums">{r.createdAt}</TableCell>
              {showPatient && (
                <TableCell>
                  <p className="font-medium">{r.patient.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{r.patient.personalId}</p>
                </TableCell>
              )}
              <TableCell>
                <InvoiceStatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-right"><Money value={r.total} /></TableCell>
              <TableCell className="hidden text-right text-muted-foreground md:table-cell"><Money value={r.insurance} /></TableCell>
              <TableCell className="text-right"><Money value={r.patientAmount} /></TableCell>
              <TableCell className="hidden text-right md:table-cell"><Money value={r.paid} /></TableCell>
              <TableCell className={cn("text-right font-medium", Number(r.debt) > 0 && "text-destructive")}>
                <Money value={r.debt} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
