import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-foreground", className)}>
      <span className="flex size-[1.6em] items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Plus className="size-[1.1em]" strokeWidth={3} />
      </span>
      კლინიკა
    </span>
  );
}
