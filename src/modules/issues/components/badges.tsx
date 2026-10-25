import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type IssuePriorityValue, type IssueStatusValue, priorityLabel, statusLabel } from "@/modules/issues/labels";

const STATUS_CLASS: Record<IssueStatusValue, string> = {
  new: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  in_progress: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  waiting: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
  rejected: "bg-muted text-muted-foreground line-through",
};

export function IssueStatusBadge({ status }: { status: IssueStatusValue }) {
  return <Badge className={cn("whitespace-nowrap", STATUS_CLASS[status])}>{statusLabel(status)}</Badge>;
}

/** ჩვეულებრივი — ნიშნის გარეშე (სიაში ყურადღებას არ ფანტავს). */
export function IssuePriorityBadge({ priority, always = false }: { priority: IssuePriorityValue; always?: boolean }) {
  if (priority === "urgent") return <Badge variant="destructive">{priorityLabel(priority)}</Badge>;
  if (priority === "high") return <Badge className="bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">{priorityLabel(priority)}</Badge>;
  return always ? <Badge variant="outline">{priorityLabel(priority)}</Badge> : null;
}

export function ConfidentialBadge() {
  return (
    <Badge variant="outline" title="ხედავს მხოლოდ ავტორი, მიმღები და ადმინისტრატორი">
      <Lock />
      კონფიდენციალური
    </Badge>
  );
}
