"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markNoShowAction, startEncounterAction } from "@/modules/emr/actions/encounter-actions";

/** „მიღების დაწყება“: ქმნის ვიზიტის ჩანაწერს, ჯავშანი → „მიღებაზე“, იხსნება ვიზიტის ფორმა (?tab=visit). */
export function StartVisitButton({ appointmentId, href }: { appointmentId: number; href: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await startEncounterAction(appointmentId);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success(res.message);
            router.push(href);
            router.refresh();
          } catch {
            toast.error("მიღება ვერ დაიწყო. სცადეთ თავიდან");
          }
        })
      }
    >
      <Play />
      {pending ? "იწყება..." : "მიღების დაწყება"}
    </Button>
  );
}

export function NoShowButton({ appointmentId }: { appointmentId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await markNoShowAction(appointmentId);
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      <UserX />
      არ გამოცხადდა
    </Button>
  );
}
