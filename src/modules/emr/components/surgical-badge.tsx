import { Scissors } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** „საოპერაციო“ ნიშანი (ვიზიტი / პაციენტი): ექიმის ბარათი, ისტორია, ანგარიშგება. uploaded — ჯანდაცვის პორტალზე ატვირთულია. */
export function SurgicalBadge({ uploaded, label = "საოპერაციო", className }: { uploaded?: boolean; label?: string; className?: string }) {
  return (
    <Badge
      className={cn("bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", className)}
      title={uploaded === undefined ? undefined : uploaded ? "ჯანდაცვის პორტალზე ატვირთულია" : "ჯანდაცვის პორტალზე ასატვირთი"}
    >
      <Scissors />
      {label}
      {uploaded && " · ატვირთულია"}
    </Badge>
  );
}
