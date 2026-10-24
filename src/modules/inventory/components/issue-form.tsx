"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageMinus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/appointment-slots";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import { consumeAction, writeoffAction } from "@/modules/inventory/actions";
import { WRITEOFF_REASONS } from "@/modules/inventory/labels";
import type { ExpiryStatus } from "@/modules/inventory/stock";
import { formatQuantity, inputQuantity } from "@/modules/inventory/stock";

/** medical — სამედიცინო; სამეურნეოს გაცემისას „ვის / სად“ სავალდებულოა. */
export type IssueItem = { id: number; name: string; unit: string; usable: number; total: number; medical: boolean };
export type IssueBatch = { id: number; itemId: number; lotNumber: string | null; expiryDate: string | null; expiry: ExpiryStatus; quantity: number };

type Mode = "consume" | "writeoff";

const batchLabel = (b: IssueBatch, unit: string) =>
  [
    b.lotNumber ? `სერია ${b.lotNumber}` : "სერიის გარეშე",
    b.expiryDate ? `ვადა ${formatDate(b.expiryDate)}${b.expiry === "expired" ? " (ვადაგასული)" : ""}` : null,
    `ნაშთი ${formatQuantity(b.quantity)} ${unit}`,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * გახარჯვა (FEFO — ყველაზე ადრე ვადაგასული ვარგისი პარტიიდან) ან ჩამოწერა კონკრეტული პარტიიდან მიზეზით.
 * modes — რომელი ჩანართები აქვს მომხმარებელს (უფლებებით).
 */
export function IssueForm({
  items,
  batches,
  modes,
  initial,
}: {
  items: IssueItem[];
  batches: IssueBatch[];
  modes: Mode[];
  initial: { mode: Mode | null; itemId: number | null; batchId: number | null };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial.mode && modes.includes(initial.mode) ? initial.mode : modes[0]);
  // ჩამოწერის ბმულიდან (ნაშთები, დასახელების გვერდი): პარტია — მითითებული ან დასახელების პირველი ვადაგასული; რაოდენობა — მთელი ნაშთი
  const initialBatch =
    mode === "writeoff"
      ? (batches.find((b) => b.id === initial.batchId) ?? batches.find((b) => b.itemId === initial.itemId && b.expiry === "expired"))
      : undefined;
  const [itemId, setItemId] = useState<number | null>(initial.itemId ?? initialBatch?.itemId ?? null);
  const [batchId, setBatchId] = useState(initialBatch ? String(initialBatch.id) : "");
  const [quantity, setQuantity] = useState(initialBatch ? inputQuantity(initialBatch.quantity) : "");
  const [reason, setReason] = useState(initialBatch?.expiry === "expired" ? "expired" : "");
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const item = items.find((i) => i.id === itemId) ?? null;
  const itemBatches = batches.filter((b) => b.itemId === itemId);
  const expired = batches.filter((b) => b.expiry === "expired");

  /** ვადაგასული პარტიის არჩევა სიიდან: ფორმა ივსება მთელი ნაშთით, მიზეზი — „ვადაგასული“. */
  function pickExpired(b: IssueBatch) {
    setItemId(b.itemId);
    setBatchId(String(b.id));
    setQuantity(inputQuantity(b.quantity));
    setReason("expired");
    setErrors({});
    setFormError(undefined);
  }

  /** არჩევის გაუქმება (ჩამოწერა გადაიფიქრა): ფორმა სუფთავდება. */
  function clearPick() {
    setItemId(null);
    setBatchId("");
    setReason("");
    reset();
  }
  const pickerItems: PickerItem[] = items.map((i) => ({ id: i.id, label: i.name, detail: `${formatQuantity(mode === "consume" ? i.usable : i.total)} ${i.unit}` }));

  function reset() {
    setQuantity("");
    setNote("");
    setRecipient("");
    setErrors({});
    setFormError(undefined);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res =
        mode === "consume"
          ? await consumeAction({ itemId: itemId ?? 0, quantity, note, recipient })
          : await writeoffAction({ batchId: Number(batchId) || 0, quantity, reason: reason as "expired", note });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.fieldErrors ? undefined : res.error);
        if (res.fieldErrors) toast.error(res.error);
        return;
      }
      toast.success(`${res.message} ${item?.unit ?? ""} — ${item?.name ?? ""}`);
      reset();
      setBatchId("");
      router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {modes.length > 1 && (
            <SegmentedChoice
              id="issue-mode"
              items={[
                { value: "consume", label: "გახარჯვა" },
                { value: "writeoff", label: "ჩამოწერა" },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                reset();
              }}
            />
          )}
          <p className="text-sm text-muted-foreground">
            {mode === "consume"
              ? "იხარჯება ვარგისი ნაშთიდან: ჯერ ის პარტია, რომელსაც ვადა ყველაზე ადრე გასდის. ვადაგასული არ იხარჯება."
              : "კონკრეტული პარტიის ჩამოწერა: ვადაგასული, დაზიანებული, დაკარგული."}
          </p>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {mode === "writeoff" && expired.length > 0 && (
            <ExpiredBatches batches={expired} items={items} selected={batchId} onPick={pickExpired} onClear={clearPick} />
          )}

          <FormField id="issue-item" label="დასახელება *" error={errors.itemId}>
            {item ? (
              <div className="flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-sm">
                <span className="font-medium">{item.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">
                    ვარგისი: {formatQuantity(item.usable)} {item.unit}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setItemId(null);
                      setBatchId("");
                    }}
                  >
                    შეცვლა
                  </Button>
                </span>
              </div>
            ) : (
              <SearchPicker
                id="issue-item"
                items={pickerItems}
                onSelect={(p) => {
                  setItemId(p.id);
                  setBatchId("");
                }}
                placeholder="მოძებნეთ დასახელება"
                invalid={Boolean(errors.itemId)}
                closeOnSelect
              />
            )}
          </FormField>

          {mode === "writeoff" && item && (
            <FormField id="issue-batch" label="პარტია *" error={errors.batchId}>
              <NativeSelectClient
                id="issue-batch"
                value={batchId}
                onChange={(v) => {
                  setBatchId(v);
                  const b = itemBatches.find((x) => String(x.id) === v);
                  if (b?.expiry === "expired") setReason("expired");
                }}
                options={[
                  { value: "", label: itemBatches.length ? "— აირჩიეთ —" : "ნაშთიანი პარტია არ არის" },
                  ...itemBatches.map((b) => ({ value: String(b.id), label: batchLabel(b, item.unit) })),
                ]}
                invalid={Boolean(errors.batchId)}
                className="h-10"
              />
            </FormField>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="issue-quantity" label={`რაოდენობა${item ? ` (${item.unit})` : ""} *`} error={errors.quantity}>
              <Input
                id="issue-quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                aria-invalid={Boolean(errors.quantity)}
                className="h-10 tabular-nums"
              />
            </FormField>
            {mode === "writeoff" && (
              <FormField id="issue-reason" label="მიზეზი *" error={errors.reason}>
                <NativeSelectClient
                  id="issue-reason"
                  value={reason}
                  onChange={setReason}
                  options={[{ value: "", label: "— აირჩიეთ —" }, ...WRITEOFF_REASONS]}
                  invalid={Boolean(errors.reason)}
                  className="h-10"
                />
              </FormField>
            )}
          </div>

          {mode === "consume" && (
            <FormField
              id="issue-recipient"
              label={item && !item.medical ? "ვის / სად გაიცა *" : "ვის / სად გაიცა"}
              error={errors.recipient}
              hint={item && !item.medical ? "სამეურნეო საქონელზე სავალდებულოა" : undefined}
            >
              <Input
                id="issue-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                maxLength={100}
                placeholder="მაგ. რეგისტრატურა, მე-3 კაბინეტი"
                aria-invalid={Boolean(errors.recipient)}
                className="h-10"
              />
            </FormField>
          )}

          <FormField id="issue-note" label={mode === "writeoff" && reason === "other" ? "შენიშვნა *" : "შენიშვნა"} error={errors.note}>
            <Textarea
              id="issue-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={mode === "consume" ? "მაგ. პროცედურა, მიზეზი" : undefined}
            />
          </FormField>

          <div className="flex justify-end gap-2">
            {item && (
              <Button type="button" size="lg" variant="outline" onClick={clearPick} disabled={pending}>
                გასუფთავება
              </Button>
            )}
            <Button type="submit" size="lg" disabled={pending || !item} variant={mode === "writeoff" ? "destructive" : "default"}>
              <PackageMinus />
              {pending ? "ინახება..." : mode === "consume" ? "გახარჯვა" : "ჩამოწერა"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** ჩამოსაწერი: ყველა ვადაგასული პარტია ნაშთით. „ჩამოწერა“ ფორმას ავსებს — რჩება მხოლოდ შენახვა. */
function ExpiredBatches({
  batches,
  items,
  selected,
  onPick,
  onClear,
}: {
  batches: IssueBatch[];
  items: IssueItem[];
  selected: string;
  onPick: (b: IssueBatch) => void;
  onClear: () => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <TriangleAlert className="size-4" />
        ჩამოსაწერი ვადაგასული პარტიები ({batches.length})
      </h3>
      <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border bg-background">
        {batches.map((b) => {
          const item = items.find((i) => i.id === b.itemId);
          const isSelected = selected === String(b.id);
          return (
            <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{item?.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {[b.lotNumber ? `სერია ${b.lotNumber}` : null, b.expiryDate ? `ვადა ${formatDate(b.expiryDate)}` : null, `ნაშთი ${formatQuantity(b.quantity)} ${item?.unit ?? ""}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {isSelected ? (
                <Button type="button" size="sm" variant="secondary" onClick={onClear} title="არჩევის გაუქმება — ფორმა გასუფთავდება">
                  <X />
                  გაუქმება
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => onPick(b)}>
                  ჩამოწერა
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
