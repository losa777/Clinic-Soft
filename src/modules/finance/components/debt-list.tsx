import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fromTetri, toTetri } from "@/modules/finance/calc";
import type { DebtRow, InsurerDebtRow } from "@/modules/finance/server/debts";
import { Money } from "./invoice-status-badge";

/** პაციენტების დავალიანებები (დიდიდან პატარისკენ). patientHref — პაციენტის ბარათი (null — ბმულის გარეშე). */
export function DebtList({
  rows,
  patients,
  total,
  patientHref,
}: {
  rows: DebtRow[];
  patients: number;
  total: string;
  patientHref: ((id: number) => string) | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        პაციენტი: <b className="text-foreground">{patients}</b> · ჯამური ვალი: <b className="text-destructive"><Money value={total} /></b>
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10">პაციენტი</TableHead>
              <TableHead className="h-10">პირადი ნომერი</TableHead>
              <TableHead className="hidden h-10 md:table-cell">ტელეფონი</TableHead>
              <TableHead className="h-10 text-right">ღია ინვოისი</TableHead>
              <TableHead className="hidden h-10 md:table-cell">უძველესი</TableHead>
              <TableHead className="h-10 text-right">ვალი</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  დავალიანება არ არის
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.patientId}>
                <TableCell className="font-medium">
                  {patientHref ? (
                    <Link href={patientHref(r.patientId)} className="text-primary hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.personalId}</TableCell>
                <TableCell className="hidden md:table-cell">{r.phone ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.invoices}</TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">{r.oldest}</TableCell>
                <TableCell className="text-right font-semibold text-destructive"><Money value={r.debt} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** სადაზღვევო კომპანიების დავალიანება პერიოდში. */
export function InsurerDebtList({ rows, period }: { rows: InsurerDebtRow[]; period: string }) {
  const total = fromTetri(rows.reduce((s, r) => s + toTetri(r.amount), 0));
  return (
    <Card>
      <CardHeader>
        <CardTitle>სადაზღვევო კომპანიების დავალიანება</CardTitle>
        <p className="text-sm text-muted-foreground">{period} — გაუქმებელი ინვოისების დაზღვევის წილი</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>კომპანია</TableHead>
              <TableHead className="text-right">ინვოისი</TableHead>
              <TableHead className="text-right">გადასახდელი</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                  ამ პერიოდში სადაზღვევო წილი არ არის
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.companyId}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{r.invoices}</TableCell>
                <TableCell className="text-right"><Money value={r.amount} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>ჯამი</TableCell>
                <TableCell className="text-right"><Money value={total} /></TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}
