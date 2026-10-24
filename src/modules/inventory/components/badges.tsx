import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/appointment-slots";
import type { ExpiryStatus, StockLevel } from "@/modules/inventory/stock";

const AMBER = "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";

/** ნაშთის დონე: ამოიწურა / მცირეა (ნორმალური — ნიშნის გარეშე). */
export function LevelBadge({ level }: { level: StockLevel }) {
  if (level === "out") return <Badge variant="destructive">ამოიწურა</Badge>;
  if (level === "low") return <Badge className={AMBER}>მცირე ნაშთი</Badge>;
  return null;
}

/** ვადა: თარიღი ფერით — გასული (წითელი), 30 დღეში იწურება (ყვითელი). */
export function ExpiryBadge({ date, status }: { date: string | null; status: ExpiryStatus }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const text = formatDate(date);
  if (status === "expired") return <Badge variant="destructive">{text} · ვადაგასული</Badge>;
  if (status === "expiring") return <Badge className={AMBER}>{text}</Badge>;
  return <span className="tabular-nums">{text}</span>;
}
