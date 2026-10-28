import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/appointment-slots";
import { formatGel } from "@/lib/money";
import { cn } from "@/lib/utils";
import { MOVEMENT_LABELS, REASON_LABELS } from "@/modules/inventory/labels";
import type { MovementRow } from "@/modules/inventory/server/stock";
import { formatQuantity } from "@/modules/inventory/stock";

const TYPE_CLASS: Record<MovementRow["type"], string> = {
  receipt: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  consumption: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  writeoff: "bg-destructive/10 text-destructive",
  adjustment: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
};

function details(m: MovementRow) {
  const parts = [
    m.reason ? REASON_LABELS[m.reason] : null,
    m.type === "receipt" ? [m.supplier, m.documentNumber && `ზედნ. ${m.documentNumber}`].filter(Boolean).join(", ") || null : null,
    m.patient ? `პაციენტი: ${m.patient}` : null,
    m.recipient ? `გაიცა: ${m.recipient}` : null,
    m.note,
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * მოძრაობების ჟურნალი. itemHref — დასახელების ბარათის ბმული (null — დასახელების სვეტი არ ჩანს, ბარათზე).
 * showCost — თანხა შესყიდვის ფასით (inventory.reports).
 */
export function MovementList({ rows, itemHref, showCost = false }: { rows: MovementRow[]; itemHref: ((id: number) => string) | null; showCost?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-10">დრო</TableHead>
            {itemHref && <TableHead className="h-10">დასახელება</TableHead>}
            <TableHead className="h-10">ოპერაცია</TableHead>
            <TableHead className="h-10 text-right">რაოდენობა</TableHead>
            {showCost && <TableHead className="h-10 text-right">თანხა</TableHead>}
            <TableHead className="hidden h-10 md:table-cell">პარტია</TableHead>
            <TableHead className="hidden h-10 lg:table-cell">დეტალები</TableHead>
            <TableHead className="hidden h-10 sm:table-cell">თანამშრომელი</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                მოძრაობა არ არის
              </TableCell>
            </TableRow>
          )}
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="tabular-nums whitespace-nowrap">{m.at}</TableCell>
              {itemHref && (
                <TableCell className="whitespace-normal">
                  <Link href={itemHref(m.itemId)} className="font-medium text-primary hover:underline">
                    {m.itemName}
                  </Link>
                </TableCell>
              )}
              <TableCell>
                <Badge className={TYPE_CLASS[m.type]}>{MOVEMENT_LABELS[m.type]}</Badge>
              </TableCell>
              <TableCell className={cn("text-right font-medium tabular-nums whitespace-nowrap", m.quantity < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                {m.quantity > 0 ? "+" : ""}
                {formatQuantity(m.quantity)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
              </TableCell>
              {showCost && (
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {m.amountTetri === null ? (
                    <span className="text-xs text-muted-foreground">ფასი არ არის</span>
                  ) : (
                    <>
                      <span className={cn(m.type === "receipt" && "font-medium")}>{formatGel(Math.abs(m.amountTetri) / 100)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatGel(m.unitCost ?? 0)} / {m.unit}
                      </span>
                    </>
                  )}
                </TableCell>
              )}
              <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                {[m.lotNumber, m.expiryDate && formatDate(m.expiryDate)].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="hidden max-w-80 text-xs whitespace-normal text-muted-foreground lg:table-cell">{details(m) || "—"}</TableCell>
              <TableCell className="hidden sm:table-cell">{m.user ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
