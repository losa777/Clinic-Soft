"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckBig, Lock, Receipt, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatGel } from "@/lib/money";
import { completeEncounterAction } from "@/modules/emr/actions/completion-actions";
import type { CompletionPreview } from "@/modules/emr/server/completion";

/**
 * „ვიზიტის დასრულება“: ჯერ ფორმა ინახება (flush), მერე — დადასტურების ფანჯარა ინვოისის შემადგენლობით
 * (ფასები ფასების ცხრილიდან, ექიმი ვერ ცვლის), დადასტურებისას — ჩანაწერი იკეტება და ინვოისი იქმნება.
 */
export function CompleteVisit({
  encounterId,
  preview,
  hasPrimaryDiagnosis,
  blocked,
  flush,
  getVersion,
}: {
  encounterId: number;
  preview: CompletionPreview;
  hasPrimaryDiagnosis: boolean;
  blocked: string | null;
  flush: () => Promise<boolean>;
  getVersion: () => number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const total = preview.lines.reduce((sum, l) => sum + Math.round(Number(l.price) * 100) * l.quantity, 0) / 100;
  const problem = blocked ?? (hasPrimaryDiagnosis ? null : "მიუთითეთ ძირითადი დიაგნოზი (ICD-10)");

  function openDialog() {
    if (problem) return toast.error(problem);
    startTransition(async () => {
      if (!(await flush())) {
        toast.error("ფორმა ვერ შეინახა — შეასწორეთ შეცდომები და სცადეთ თავიდან");
        return;
      }
      setOpen(true);
    });
  }

  function complete() {
    startTransition(async () => {
      try {
        const res = await completeEncounterAction({ encounterId, version: getVersion() });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message, { duration: 8000 });
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("ვიზიტი ვერ დასრულდა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">ვიზიტის დასრულება</p>
          <p className="text-muted-foreground">ჩანაწერი ჩაიკეტება, ჯავშანი — „დასრულებული“, დანიშნული სერვისები ინვოისში ჩაჯდება.</p>
        </div>
        <Button size="lg" onClick={openDialog} disabled={pending}>
          <CircleCheckBig />
          {pending && !open ? "ინახება..." : "ვიზიტის დასრულება"}
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ვიზიტის დასრულება</DialogTitle>
            <DialogDescription>დასრულების შემდეგ ვიზიტის ჩანაწერი აღარ შეიცვლება.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Receipt className="size-4 text-muted-foreground" />
              {preview.lines.length === 0
                ? "დასარიცხი სერვისი არ არის — ინვოისი არ შეიქმნება"
                : preview.existingInvoice
                  ? `დამატებითი ინვოისი (ძირითადი — ${preview.existingInvoice})`
                  : "ინვოისი"}
            </p>
            {preview.lines.length > 0 && (
              <table className="w-full">
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.serviceId} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">
                        {l.name}
                        {l.quantity > 1 && <span className="text-muted-foreground"> ×{l.quantity}</span>}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatGel(((Math.round(Number(l.price) * 100) * l.quantity) / 100).toFixed(2))}</td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="pt-2">სულ (ფასების ცხრილით)</td>
                    <td className="pt-2 text-right tabular-nums">{formatGel(total.toFixed(2))}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {preview.lines.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                ფასი ფასების ცხრილიდან აიღება და ექიმი მას ვერ ცვლის. დაზღვევის წილი ინვოისში ავტომატურად გამოითვლება; გადახდა — რეგისტრატურაში.
              </p>
            )}
            {preview.skipped.length > 0 && (
              <Alert>
                <TriangleAlert />
                <AlertDescription>ვერ დაირიცხება (სერვისი გათიშულია): {preview.skipped.join(", ")} — რეგისტრატურამ ხელით დაამატოს.</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              გაუქმება
            </Button>
            <Button onClick={complete} disabled={pending}>
              <CircleCheckBig />
              {pending ? "სრულდება..." : "დასრულება"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
