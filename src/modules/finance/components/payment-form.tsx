"use client";

import { startNavigationProgress } from "@/components/navigation-progress";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Banknote, CreditCard, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { formatGel } from "@/lib/money";
import { cancelInvoiceAction } from "@/modules/finance/actions/invoice-actions";
import { acceptPaymentAction, type PaymentResult, refundAction } from "@/modules/finance/actions/payment-actions";
import { cashChange, fromTetri, toTetri } from "@/modules/finance/calc";
import { PAYMENT_METHODS, type PaymentMethod } from "@/modules/finance/types";

type Dialogs = "payment" | "refund" | "cancel" | null;

/** ინვოისის მოქმედებები უფლებების მიხედვით: გადახდა, დაბრუნება, გაუქმება. */
export function InvoiceActions({
  invoiceId,
  invoiceNumber,
  debt,
  paid,
  paidByMethod,
  can,
  receiptHref,
}: {
  invoiceId: number;
  invoiceNumber: string;
  debt: string;
  paid: string;
  paidByMethod: Record<PaymentMethod, string>;
  can: { pay: boolean; refund: boolean; cancel: boolean };
  /** ქვითრის მისამართის თარგი: {paymentId} იცვლება; null — როლს ბეჭდვა არ აქვს */
  receiptHref: string | null;
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);
  const showPay = can.pay && Number(debt) > 0;
  const showRefund = can.refund && Number(paid) > 0;
  const showCancel = can.cancel;
  if (!showPay && !showRefund && !showCancel) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {showPay && (
        <Button size="lg" onClick={() => setDialog("payment")}>
          <Banknote />
          გადახდის მიღება
        </Button>
      )}
      {showRefund && (
        <Button size="lg" variant="outline" onClick={() => setDialog("refund")}>
          <Undo2 />
          დაბრუნება
        </Button>
      )}
      {showCancel && (
        <Button size="lg" variant="destructive" onClick={() => setDialog("cancel")}>
          <Ban />
          ინვოისის გაუქმება
        </Button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {dialog === "payment" && <PaymentForm invoiceId={invoiceId} debt={debt} receiptHref={receiptHref} onDone={close} />}
          {dialog === "refund" && (
            <RefundForm invoiceId={invoiceId} paid={paid} paidByMethod={paidByMethod} receiptHref={receiptHref} onDone={close} />
          )}
          {dialog === "cancel" && <CancelForm invoiceId={invoiceId} invoiceNumber={invoiceNumber} paid={paid} onDone={close} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useSubmit<T extends ActionResult | PaymentResult>(onDone: () => void, receiptHref?: string | null) {
  const router = useRouter();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<T>) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setFailure(res);
          return;
        }
        const href = "paymentId" in res && receiptHref ? receiptHref.replace("{paymentId}", String(res.paymentId)) : null;
        toast.success(res.message, href ? { action: { label: "ქვითრის ბეჭდვა", onClick: () => (startNavigationProgress(), router.push(href)) }, duration: 10_000 } : undefined);
        onDone();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  return {
    run,
    pending,
    errors: failure?.fieldErrors ?? {},
    formError: failure && !failure.fieldErrors ? failure.error : undefined,
  };
}

function FormError({ error }: { error?: string }) {
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}

export function PaymentForm({
  invoiceId,
  debt,
  receiptHref,
  onDone,
}: {
  invoiceId: number;
  debt: string;
  receiptHref: string | null;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(debt);
  const [received, setReceived] = useState("");
  const [cardReference, setCardReference] = useState("");
  const { run, pending, errors, formError } = useSubmit<PaymentResult>(onDone, receiptHref);

  // ხურდა — მხოლოდ საჩვენებლად (სერვერი თავიდან ითვლის)
  let change: string | null = null;
  try {
    if (method === "cash" && received) {
      const r = cashChange(toTetri(amount), toTetri(received));
      change = r.ok ? fromTetri(r.change) : null;
    }
  } catch {
    change = null;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => acceptPaymentAction({ invoiceId, method, amount, receivedAmount: method === "cash" ? received : "", cardReference }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>გადახდის მიღება</DialogTitle>
        <DialogDescription>დავალიანება: {formatGel(debt)}. შეიძლება ნაწილობრივი გადახდაც.</DialogDescription>
      </DialogHeader>
      <FormError error={formError} />
      <FormField id="payment-method" label="მეთოდი">
        <SegmentedChoice id="payment-method" items={PAYMENT_METHODS} value={method} onChange={setMethod} />
      </FormField>
      <FormField id="payment-amount" label="გადასახდელი თანხა (₾)" error={errors.amount} hint="ნაგულისხმევად — მთელი დავალიანება">
        <Input
          id="payment-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={errors.amount ? true : undefined}
          className="h-10 tabular-nums"
        />
      </FormField>
      {method === "cash" ? (
        <FormField id="payment-received" label="მიღებული ნაღდი (₾)" error={errors.receivedAmount} hint="ხურდის გამოსათვლელად; ცარიელი — ზუსტი თანხა">
          <Input
            id="payment-received"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            aria-invalid={errors.receivedAmount ? true : undefined}
            className="h-10 tabular-nums"
          />
        </FormField>
      ) : (
        <FormField id="payment-card" label="ტრანზაქციის ნომერი ან ბარათის ბოლო 4 ციფრი" error={errors.cardReference} hint="სრული ბარათის ნომერი არ შეიყვანოთ">
          <Input
            id="payment-card"
            value={cardReference}
            onChange={(e) => setCardReference(e.target.value)}
            maxLength={30}
            autoComplete="off"
            aria-invalid={errors.cardReference ? true : undefined}
            className="h-10"
          />
        </FormField>
      )}
      {change !== null && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-lg font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          ხურდა: <span className="tabular-nums">{formatGel(change)}</span>
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {method === "cash" ? <Banknote /> : <CreditCard />}
          {pending ? "მიმდინარეობს..." : "გადახდის მიღება"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RefundForm({
  invoiceId,
  paid,
  paidByMethod,
  receiptHref,
  onDone,
}: {
  invoiceId: number;
  paid: string;
  paidByMethod: Record<PaymentMethod, string>;
  receiptHref: string | null;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>(Number(paidByMethod.cash) > 0 ? "cash" : "card");
  const [amount, setAmount] = useState(paidByMethod[method]);
  const [reason, setReason] = useState("");
  const [cardReference, setCardReference] = useState("");
  const { run, pending, errors, formError } = useSubmit<PaymentResult>(onDone, receiptHref);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => refundAction({ invoiceId, method, amount, reason, cardReference }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>თანხის დაბრუნება</DialogTitle>
        <DialogDescription>
          გადახდილი: {formatGel(paid)} (ნაღდი {formatGel(paidByMethod.cash)}, ბარათი {formatGel(paidByMethod.card)}). დაბრუნება ცალკე
          ჩანაწერად და ქვითრად აისახება.
        </DialogDescription>
      </DialogHeader>
      <FormError error={formError} />
      <FormField id="refund-method" label="მეთოდი">
        <SegmentedChoice
          id="refund-method"
          items={PAYMENT_METHODS}
          value={method}
          onChange={(m) => {
            setMethod(m);
            setAmount(paidByMethod[m]);
          }}
        />
      </FormField>
      <FormField id="refund-amount" label="დასაბრუნებელი თანხა (₾)" error={errors.amount}>
        <Input
          id="refund-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={errors.amount ? true : undefined}
          className="h-10 tabular-nums"
        />
      </FormField>
      {method === "card" && (
        <FormField id="refund-card" label="ტრანზაქციის ნომერი ან ბოლო 4 ციფრი" error={errors.cardReference}>
          <Input id="refund-card" value={cardReference} onChange={(e) => setCardReference(e.target.value)} maxLength={30} className="h-10" />
        </FormField>
      )}
      <FormField id="refund-reason" label="დაბრუნების მიზეზი *" error={errors.reason}>
        <Textarea id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} autoFocus />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          <Undo2 />
          {pending ? "მიმდინარეობს..." : "დაბრუნება"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CancelForm({ invoiceId, invoiceNumber, paid, onDone }: { invoiceId: number; invoiceNumber: string; paid: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { run, pending, errors, formError } = useSubmit<ActionResult>(onDone);
  const hasPayments = Number(paid) > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => cancelInvoiceAction({ invoiceId, reason }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>ინვოისის გაუქმება — {invoiceNumber}</DialogTitle>
        <DialogDescription>ინვოისი არ წაიშლება: დარჩება „გაუქმებულის“ სტატუსით და მიზეზით, ვალში აღარ ჩაითვლება.</DialogDescription>
      </DialogHeader>
      {hasPayments && (
        <Alert variant="destructive">
          <AlertDescription>ინვოისზე გადახდილია {formatGel(paid)}. გაუქმებამდე ჯერ დააბრუნეთ თანხა.</AlertDescription>
        </Alert>
      )}
      <FormError error={formError} />
      <FormField id="invoice-cancel-reason" label="გაუქმების მიზეზი *" error={errors.reason}>
        <Textarea id="invoice-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} autoFocus />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" variant="destructive" disabled={pending || hasPayments}>
          {pending ? "მიმდინარეობს..." : "გაუქმება"}
        </Button>
      </DialogFooter>
    </form>
  );
}
