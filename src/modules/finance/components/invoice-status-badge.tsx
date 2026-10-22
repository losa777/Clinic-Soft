import { Badge } from "@/components/ui/badge";
import { formatGel } from "@/lib/money";
import { cn } from "@/lib/utils";
import { type InvoiceStatus, invoiceStatusLabel } from "@/modules/finance/types";

const STATUS_CLASS: Record<InvoiceStatus, string> = {
  unpaid: "bg-destructive/10 text-destructive",
  partial: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge className={cn("whitespace-nowrap", STATUS_CLASS[status])}>{invoiceStatusLabel(status)}</Badge>;
}

/** თანხა ლარში („1234,50 ₾“), ციფრები თანაბარი სიგანით. */
export function Money({ value, className }: { value: string; className?: string }) {
  return <span className={cn("tabular-nums whitespace-nowrap", className)}>{formatGel(value)}</span>;
}

/** ვალის გაფრთხილების ნიშანი (ძებნის შედეგებში, ჯავშნისას). */
export function DebtBadge({ debt, className }: { debt: string | null | undefined; className?: string }) {
  if (!debt || Number(debt) <= 0) return null;
  return (
    <Badge variant="destructive" className={cn("whitespace-nowrap", className)} title="პაციენტს აქვს გადაუხდელი ინვოისები">
      ვალი: {formatGel(debt)}
    </Badge>
  );
}
