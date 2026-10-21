"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Pencil } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { formatGel, toTetri } from "@/lib/money";
import { addVisitPayment, cancelVisit } from "@/lib/visit-actions";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/visit-schema";

/** ვიზიტის ბარათის ღილაკები: გადახდის დამატება, რედაქტირება, გაუქმება. */
export function VisitActionsBar({ visitId, debt, editHref }: { visitId: number; debt: string; editHref: string }) {
  const [dialog, setDialog] = useState<"payment" | "cancel" | null>(null);
  const close = () => setDialog(null);

  return (
    <div className="flex flex-wrap gap-2">
      {toTetri(debt) > 0 && (
        <Button size="sm" onClick={() => setDialog("payment")}>
          <Banknote />
          გადახდის დამატება
        </Button>
      )}
      <Link href={editHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Pencil />
        რედაქტირება
      </Link>
      <Button variant="destructive" size="sm" onClick={() => setDialog("cancel")}>
        <Ban />
        გაუქმება
      </Button>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {dialog === "payment" && <PaymentForm visitId={visitId} debt={debt} onDone={close} />}
          {dialog === "cancel" && <CancelForm visitId={visitId} onDone={close} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      try {
        const res = await action();
        setResult(res);
        if (res.ok) {
          toast.success(res.message);
          onDone();
          router.refresh();
        }
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const formError = result && !result.ok && !result.fieldErrors ? result.error : undefined;
  return { run, pending, errors, formError };
}

function PaymentForm({ visitId, debt, onDone }: { visitId: number; debt: string; onDone: () => void }) {
  const [amount, setAmount] = useState(debt);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const { run, pending, errors, formError } = useSubmit(onDone);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addVisitPayment({ visitId, amount, method }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>გადახდის დამატება</DialogTitle>
        <DialogDescription>დავალიანება: {formatGel(debt)}</DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField id="payment-amount" label="თანხა (₾)" error={errors.amount} hint="ნაგულისხმევად — მთელი დავალიანება">
        <Input
          id="payment-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          aria-invalid={errors.amount ? true : undefined}
          className="h-10 tabular-nums"
        />
      </FormField>
      <FormField id="payment-method" label="გადახდის ფორმა" error={errors.method}>
        <SegmentedChoice id="payment-method" items={PAYMENT_METHODS} value={method} onChange={setMethod} invalid={!!errors.method} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CancelForm({ visitId, onDone }: { visitId: number; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { run, pending, errors, formError } = useSubmit(onDone);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => cancelVisit({ visitId, reason }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>ვიზიტის გაუქმება</DialogTitle>
        <DialogDescription>
          ვიზიტი ისტორიაში დარჩება „გაუქმებულის“ აღნიშვნით და ჯამებში აღარ ჩაითვლება. გადახდილი თანხის დაბრუნება ცალკე
          უნდა მოხდეს.
        </DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField id="cancel-reason" label="გაუქმების მიზეზი *" error={errors.reason}>
        <Textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
          rows={3}
          maxLength={500}
          aria-invalid={errors.reason ? true : undefined}
          placeholder="მაგ. შეცდომით დარეგისტრირდა"
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "მიმდინარეობს..." : "ვიზიტის გაუქმება"}
        </Button>
      </DialogFooter>
    </form>
  );
}
