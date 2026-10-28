import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fromTetri, toTetri } from "@/modules/finance/calc";
import type { BankTotal } from "@/modules/finance/types";
import { Money } from "./invoice-status-badge";

/** ბანკიდან შემოსული თანხები (ბარათით): ბანკი, ოპერაციები, გადახდა, დაბრუნება, წმინდა. დღის ანგარიში და ფინანსური ანალიზი. */
export function BankTotals({ rows }: { rows: BankTotal[] }) {
  const sum = (key: "payments" | "refunds" | "net") => fromTetri(rows.reduce((s, r) => s + toTetri(r[key]), 0));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-4" />
          ბარათით — ბანკების მიხედვით
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>ბანკი</TableHead>
              <TableHead className="text-right">გადახდა (რაოდ.)</TableHead>
              <TableHead className="text-right">გადახდა</TableHead>
              <TableHead className="text-right">დაბრუნება</TableHead>
              <TableHead className="text-right">წმინდა</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                  ბარათით გადახდა არ არის
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.bankId ?? "none"}>
                <TableCell className={r.bankId === null ? "text-muted-foreground" : "font-medium"}>{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                <TableCell className="text-right">
                  <Money value={r.payments} />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={r.refunds} />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Money value={r.net} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 1 && (
            <TableFooter>
              <TableRow>
                <TableCell>სულ</TableCell>
                <TableCell className="text-right tabular-nums">{rows.reduce((s, r) => s + r.count, 0)}</TableCell>
                <TableCell className="text-right">
                  <Money value={sum("payments")} />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={sum("refunds")} />
                </TableCell>
                <TableCell className="text-right font-semibold">
                  <Money value={sum("net")} />
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}
