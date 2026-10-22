import { Badge } from "@/components/ui/badge";
import { type AppointmentStatus, appointmentStatusLabel } from "@/lib/appointment-schema";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  booked: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  arrived: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  in_progress: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground line-through",
  no_show: "bg-destructive/10 text-destructive",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge className={cn("whitespace-nowrap", STATUS_CLASS[status])}>{appointmentStatusLabel(status)}</Badge>;
}
