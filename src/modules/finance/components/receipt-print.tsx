"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatGel } from "@/lib/money";
import { cn } from "@/lib/utils";
import { recordReceiptPrint } from "@/modules/finance/actions/payment-actions";
import { paymentMethodLabel, type ReceiptData } from "@/modules/finance/types";

type Format = "thermal" | "a4";

const FORMATS: { value: Format; label: string }[] = [
  { value: "thermal", label: "80 მმ (თერმო)" },
  { value: "a4", label: "A4" },
];

/** ბეჭდვისას მხოლოდ ქვითარი ჩანს; @page — ქაღალდის ზომა არჩეული ფორმატით. */
const PRINT_CSS: Record<Format, string> = {
  thermal: "@page { size: 80mm auto; margin: 2mm; }",
  a4: "@page { size: A4; margin: 15mm; }",
};
const HIDE_REST = `@media print {
  body * { visibility: hidden !important; }
  #receipt, #receipt * { visibility: visible !important; }
  #receipt { position: absolute; left: 0; top: 0; box-shadow: none !important; border: 0 !important; }
  html, body { background: #fff !important; }
}`;

/**
 * ქვითრის ბეჭდვა: 80მმ თერმოპრინტერი ან A4. ყოველი ბეჭდვა აღირიცხება (receipt_prints);
 * პირველის შემდეგ ქვითარზე „დუბლიკატი“ იწერება.
 */
export function ReceiptPrint({ data, paymentId, backHref }: { data: ReceiptData; paymentId: number; backHref: string }) {
  const [format, setFormat] = useState<Format>("thermal");
  const [printed, setPrinted] = useState(data.printCount);
  const [pending, startTransition] = useTransition();
  const duplicate = printed > 0;

  function print() {
    startTransition(async () => {
      try {
        const res = await recordReceiptPrint({ paymentId, format });
        if (!res.ok) {
          toast.error(res.error ?? "ბეჭდვა ვერ აღირიცხა");
          return;
        }
      } catch {
        toast.error("ბეჭდვა ვერ აღირიცხა. სცადეთ თავიდან");
        return;
      }
      window.print();
      setPrinted((n) => n + 1);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <style>{`${PRINT_CSS[format]}\n${HIDE_REST}`}</style>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={backHref} className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft />
          ინვოისზე დაბრუნება
        </Link>
        <div className="w-64">
          <SegmentedChoice id="receipt-format" items={FORMATS} value={format} onChange={setFormat} />
        </div>
        <Button size="lg" onClick={print} disabled={pending}>
          <Printer />
          {duplicate ? "დუბლიკატის ბეჭდვა" : "ბეჭდვა"}
        </Button>
        {duplicate && <span className="text-sm text-muted-foreground">დაბეჭდილია {printed}-ჯერ</span>}
      </div>

      <div className="flex justify-center rounded-xl bg-muted/40 p-4 print:bg-transparent print:p-0">
        <Receipt data={data} format={format} duplicate={duplicate} />
      </div>
    </div>
  );
}

function Receipt({ data: d, format, duplicate }: { data: ReceiptData; format: Format; duplicate: boolean }) {
  const thermal = format === "thermal";
  const refund = d.type === "refund";
  return (
    <article
      id="receipt"
      className={cn(
        "bg-white text-black shadow-sm",
        thermal ? "w-[72mm] p-2 font-mono text-[11px] leading-snug" : "w-[180mm] max-w-full p-8 text-sm",
      )}
    >
      <header className={cn("text-center", thermal ? "mb-2" : "mb-6")}>
        <p className={cn("font-bold", thermal ? "text-[13px]" : "text-xl")}>{d.clinic.name}</p>
        {d.clinic.legalName && <p>{d.clinic.legalName}</p>}
        {d.clinic.taxId && <p>ს/კ {d.clinic.taxId}</p>}
        {d.clinic.address && <p>{d.clinic.address}</p>}
        {d.clinic.phone && <p>ტელ. {d.clinic.phone}</p>}
      </header>

      {duplicate && (
        <p className={cn("mb-2 border-2 border-black text-center font-bold tracking-widest", thermal ? "py-0.5" : "py-1 text-lg")}>
          დუბლიკატი
        </p>
      )}

      <p className={cn("text-center font-bold", thermal ? "text-[12px]" : "text-lg")}>{refund ? "თანხის დაბრუნების ქვითარი" : "ქვითარი"} № {d.receiptNumber}</p>
      <Rows
        thermal={thermal}
        rows={[
          ["თარიღი", d.createdAt],
          ["ინვოისი", d.invoiceNumber],
          ["პაციენტი", d.patient.name],
          ["პირადი ნომერი", d.patient.personalId],
          ...(d.insurance ? [["დაზღვევა", d.insurance] as [string, string]] : []),
        ]}
      />

      <Divider thermal={thermal} />
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="font-semibold">სერვისი</th>
            <th className="text-right font-semibold">ჯამი</th>
            {!thermal && <th className="text-right font-semibold">დაზღვევა</th>}
            {!thermal && <th className="text-right font-semibold">პაციენტი</th>}
          </tr>
        </thead>
        <tbody>
          {d.items.map((it, n) => (
            <tr key={n} className="align-top">
              <td className="pr-2">
                {it.name}
                {it.quantity > 1 && ` ×${it.quantity}`}
              </td>
              <td className="text-right whitespace-nowrap">{formatGel(it.total)}</td>
              {!thermal && <td className="text-right whitespace-nowrap">{formatGel(it.insurance)}</td>}
              {!thermal && <td className="text-right whitespace-nowrap">{formatGel(it.patient)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <Divider thermal={thermal} />

      <Rows
        thermal={thermal}
        rows={[
          ["ჯამი", formatGel(d.totals.total)],
          ["დაზღვევის წილი", formatGel(d.totals.insurance)],
          ["პაციენტის წილი", formatGel(d.totals.patient)],
        ]}
      />
      <Divider thermal={thermal} />
      <Rows
        thermal={thermal}
        strong
        rows={[[refund ? "დაბრუნებული თანხა" : "გადახდილი თანხა", formatGel(d.amount)]]}
      />
      <Rows
        thermal={thermal}
        rows={[
          ["მეთოდი", paymentMethodLabel(d.method)],
          ...(d.bank ? [["ბანკი", d.bank] as [string, string]] : []),
          ...(d.receivedAmount && !refund ? [["მიღებული", formatGel(d.receivedAmount)] as [string, string]] : []),
          ...(d.changeAmount && Number(d.changeAmount) > 0 ? [["ხურდა", formatGel(d.changeAmount)] as [string, string]] : []),
          ...(d.cardReference ? [["ტრანზაქცია", d.cardReference] as [string, string]] : []),
          ...(d.reason ? [["მიზეზი", d.reason] as [string, string]] : []),
          ["ნარჩენი ვალი", formatGel(d.remainingDebt)],
          ["მოლარე", d.cashier ?? "—"],
        ]}
      />

      {d.clinic.footer && <p className={cn("text-center", thermal ? "mt-3" : "mt-8")}>{d.clinic.footer}</p>}
      {!thermal && (
        <div className="mt-12 grid grid-cols-2 gap-12 text-xs">
          <p className="border-t border-black pt-1">მოლარის ხელმოწერა</p>
          <p className="border-t border-black pt-1">პაციენტის ხელმოწერა</p>
        </div>
      )}
    </article>
  );
}

function Rows({ rows, thermal, strong }: { rows: [string, string][]; thermal: boolean; strong?: boolean }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-3", thermal ? "mt-1" : "mt-3 gap-y-1", strong && (thermal ? "text-[13px] font-bold" : "text-lg font-bold"))}>
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}:</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Divider({ thermal }: { thermal: boolean }) {
  return <hr className={cn("border-black", thermal ? "my-1.5 border-dashed" : "my-3")} />;
}
