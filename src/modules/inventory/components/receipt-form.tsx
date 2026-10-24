"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SearchPicker } from "@/components/search-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import { createReceiptAction } from "@/modules/inventory/actions";
import type { InventoryRoutes } from "@/modules/inventory/routes";
import type { PickerItemData } from "@/modules/inventory/server/stock";

type Line = { key: number; itemId: number; quantity: string; lotNumber: string; expiryDate: string; unitCost: string };

/** შემოსავალი: ზედნადების მონაცემები და ხაზები (დასახელება, რაოდენობა, სერია, ვადა, ფასი). */
export function ReceiptForm({
  items,
  suppliers,
  today,
  routes,
}: {
  items: PickerItemData[];
  suppliers: { id: number; name: string }[];
  today: string;
  routes: InventoryRoutes;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const byId = new Map(items.map((i) => [i.id, i]));

  const update = (key: number, patch: Partial<Line>) => setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineError = (i: number, field: keyof Line) => errors[`lines.${i}.${field}`];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createReceiptAction({
        supplierId: Number(supplierId) || null,
        documentNumber,
        receivedOn,
        note,
        lines: lines.map(({ itemId, quantity, lotNumber, expiryDate, unitCost }) => ({ itemId, quantity, lotNumber, expiryDate, unitCost })),
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
        return;
      }
      toast.success(res.message);
      router.push(routes.stock);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>ზედნადები</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="receipt-supplier" label="მომწოდებელი" error={errors.supplierId}>
            <NativeSelectClient
              id="receipt-supplier"
              value={supplierId}
              onChange={setSupplierId}
              options={[{ value: "", label: "— არ არის მითითებული —" }, ...suppliers.map((s) => ({ value: String(s.id), label: s.name }))]}
              className="h-10"
            />
          </FormField>
          <FormField id="receipt-doc" label="ზედნადების №" error={errors.documentNumber}>
            <Input id="receipt-doc" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} maxLength={50} className="h-10" />
          </FormField>
          <FormField id="receipt-date" label="მიღების თარიღი *" error={errors.receivedOn}>
            <Input id="receipt-date" type="date" value={receivedOn} max={today} onChange={(e) => setReceivedOn(e.target.value)} className="h-10" />
          </FormField>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField id="receipt-note" label="შენიშვნა" error={errors.note}>
              <Textarea id="receipt-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>დასახელებები</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SearchPicker
            id="receipt-items"
            items={items.map((i) => ({ id: i.id, label: i.name, detail: i.unit }))}
            onSelect={(item) => {
              setLines((list) => [...list, { key: nextKey, itemId: item.id, quantity: "", lotNumber: "", expiryDate: "", unitCost: "" }]);
              setNextKey((k) => k + 1);
              setErrors((e) => ({ ...e, lines: "" }));
            }}
            placeholder="მოძებნეთ და დაამატეთ დასახელება"
            emptyText="ვერ მოიძებნა — დაამატეთ კატალოგში"
            invalid={Boolean(errors.lines)}
          />
          {errors.lines && <p className="text-xs text-destructive">{errors.lines}</p>}
          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-48">დასახელება</TableHead>
                    <TableHead className="w-32">რაოდენობა *</TableHead>
                    <TableHead className="w-36">სერია</TableHead>
                    <TableHead className="w-44">ვარგისია (ჩათვლით)</TableHead>
                    <TableHead className="w-32">ერთ. ფასი (₾)</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">წაშლა</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => {
                    const item = byId.get(l.itemId);
                    return (
                      <TableRow key={l.key} className="align-top">
                        <TableCell className="whitespace-normal">
                          <span className="font-medium">{item?.name}</span>
                          {lineError(i, "itemId") && <p className="text-xs text-destructive">{lineError(i, "itemId")}</p>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              aria-label="რაოდენობა"
                              value={l.quantity}
                              onChange={(e) => update(l.key, { quantity: e.target.value })}
                              inputMode="decimal"
                              aria-invalid={Boolean(lineError(i, "quantity"))}
                              className="h-9 tabular-nums"
                            />
                            <span className="text-xs text-muted-foreground">{item?.unit}</span>
                          </div>
                          {lineError(i, "quantity") && <p className="text-xs text-destructive">{lineError(i, "quantity")}</p>}
                        </TableCell>
                        <TableCell>
                          <Input aria-label="სერია" value={l.lotNumber} onChange={(e) => update(l.key, { lotNumber: e.target.value })} maxLength={50} className="h-9" />
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label="ვარგისიანობის ვადა"
                            type="date"
                            min={today}
                            value={l.expiryDate}
                            onChange={(e) => update(l.key, { expiryDate: e.target.value })}
                            aria-invalid={Boolean(lineError(i, "expiryDate"))}
                            className="h-9"
                          />
                          {lineError(i, "expiryDate") ? (
                            <p className="text-xs text-destructive">{lineError(i, "expiryDate")}</p>
                          ) : (
                            item?.tracksExpiry && !l.expiryDate && <p className="text-xs text-muted-foreground">სავალდებულოა</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label="ერთეულის ფასი"
                            value={l.unitCost}
                            onChange={(e) => update(l.key, { unitCost: e.target.value })}
                            inputMode="decimal"
                            placeholder="არასავალდ."
                            aria-invalid={Boolean(lineError(i, "unitCost"))}
                            className="h-9 tabular-nums"
                          />
                          {lineError(i, "unitCost") && <p className="text-xs text-destructive">{lineError(i, "unitCost")}</p>}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                            aria-label="ხაზის წაშლა"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            ვადაგასულის მიღება არ შეიძლება. ერთი დასახელება სხვადასხვა სერიით/ვადით — ცალ-ცალკე ხაზად.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" onClick={() => router.push(routes.stock)} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" size="lg" disabled={pending || lines.length === 0}>
          <PackagePlus />
          {pending ? "ინახება..." : "შემოსავლის აღრიცხვა"}
        </Button>
      </div>
    </form>
  );
}
