"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/appointment-slots";
import { cn } from "@/lib/utils";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import { applyCountAction } from "@/modules/inventory/actions";
import { CATEGORIES, CATEGORY_LABELS, type InventoryCategoryValue } from "@/modules/inventory/labels";
import { formatQuantity, parseQuantity } from "@/modules/inventory/stock";

export type CountItem = {
  id: number;
  name: string;
  unit: string;
  category: InventoryCategoryValue;
  batches: { id: number; lotNumber: string | null; expiryDate: string | null; quantity: number }[];
};

/**
 * ინვენტარიზაცია: სისტემის ნაშთი პარტიებით → დათვლილი რაოდენობა. ცარიელი ველი — არ შეცვლილა.
 * ინახება მხოლოდ სხვაობა (კორექტირება ჟურნალში). სია იბეჭდება ხელით დასათვლელად.
 */
export function CountForm({ items, today }: { items: CountItem[]; today: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [note, setNote] = useState(`ინვენტარიზაცია ${formatDate(today)}`);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (category === "all" || i.category === category) && (!q || i.name.toLowerCase().includes(q)));
  }, [items, search, category]);

  const batches = items.flatMap((i) => i.batches);
  const changed = batches.filter((b) => (counted[b.id] ?? "").trim() !== "" && parseQuantity(counted[b.id]) !== b.quantity);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lines = changed.map((b) => ({ batchId: b.id, expected: b.quantity, counted: counted[b.id] }));
    startTransition(async () => {
      const res = await applyCountAction({ note, lines });
      if (!res.ok) {
        // zod: lines.<i>.counted → batch.<id>
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) {
          const m = /^lines\.(\d+)\./.exec(k);
          mapped[m ? `batch.${lines[Number(m[1])]?.batchId}` : k] = v;
        }
        setErrors(mapped);
        setFormError(res.error);
        return;
      }
      toast.success(res.message);
      setCounted({});
      setErrors({});
      setFormError(undefined);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center print:hidden">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ძებნა დასახელებით" className="h-9 pl-8" aria-label="ძებნა" />
        </div>
        <NativeSelectClient id="count-category" value={category} onChange={setCategory} options={[{ value: "all", label: "ყველა კატეგორია" }, ...CATEGORIES]} className="lg:w-48" />
        <Button type="button" variant="outline" size="lg" className="h-9" onClick={() => window.print()}>
          <Printer />
          დათვლის სიის ბეჭდვა
        </Button>
      </div>
      {formError && (
        <Alert variant="destructive" className="print:hidden">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <h2 className="hidden text-lg font-semibold print:block">ინვენტარიზაცია — {formatDate(today)}</h2>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>დასახელება / პარტია</TableHead>
              <TableHead>ვადა</TableHead>
              <TableHead className="text-right">სისტემაში</TableHead>
              <TableHead className="w-36">დათვლილი</TableHead>
              <TableHead className="w-28 text-right">სხვაობა</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                  ნაშთიანი დასახელება ვერ მოიძებნა
                </TableCell>
              </TableRow>
            )}
            {shown.map((item) => (
              <Fragment key={item.id}>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={5} className="font-medium">
                    {item.name} <span className="text-xs font-normal text-muted-foreground">· {CATEGORY_LABELS[item.category]} · {item.unit}</span>
                  </TableCell>
                </TableRow>
                {item.batches.map((b) => {
                  const value = counted[b.id] ?? "";
                  const parsed = value.trim() === "" ? null : parseQuantity(value);
                  const delta = parsed === null ? null : parsed - b.quantity;
                  const error = errors[`batch.${b.id}`];
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="pl-6 text-muted-foreground">{b.lotNumber ? `სერია ${b.lotNumber}` : "სერიის გარეშე"}</TableCell>
                      <TableCell className={cn("tabular-nums", b.expiryDate && b.expiryDate < today && "text-destructive")}>
                        {b.expiryDate ? formatDate(b.expiryDate) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(b.quantity)}</TableCell>
                      <TableCell>
                        <Input
                          aria-label={`დათვლილი — ${item.name}${b.lotNumber ? `, ${b.lotNumber}` : ""}`}
                          value={value}
                          onChange={(e) => setCounted((c) => ({ ...c, [b.id]: e.target.value }))}
                          inputMode="decimal"
                          aria-invalid={Boolean(error) || (value.trim() !== "" && parsed === null)}
                          className="h-8 tabular-nums"
                        />
                        {error && <p className="text-xs text-destructive">{error}</p>}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          delta !== null && delta < 0 && "text-destructive",
                          delta !== null && delta > 0 && "text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {delta === null || delta === 0 ? (delta === 0 ? "✓" : "") : `${delta > 0 ? "+" : ""}${formatQuantity(delta)}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end print:hidden">
        <div className="flex-1">
          <FormField id="count-note" label="შენიშვნა *" error={errors.note}>
            <Input id="count-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="h-10" />
          </FormField>
        </div>
        <Button type="submit" size="lg" className="h-10" disabled={pending || changed.length === 0}>
          <ClipboardCheck />
          {pending ? "ინახება..." : `სხვაობის შენახვა${changed.length ? ` (${changed.length})` : ""}`}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        ცარიელი ველი — არ შეცვლილა. ინახება მხოლოდ სხვაობა (კორექტირება მოძრაობების ჟურნალში). ნაკლული ვადაგასული პარტია — ჩამოწერით.
      </p>
    </form>
  );
}
