"use client";

import { useMemo, useState, useTransition } from "react";
import { type SortingState, useTable } from "@tanstack/react-table";
import { Pencil, Plus, Power, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import { saveItemAction, saveSupplierAction, setItemActiveAction } from "@/modules/inventory/actions";
import { CATEGORIES, CATEGORY_LABELS, GENERAL_CATEGORIES, type InventoryCategoryValue, UNIT_SUGGESTIONS } from "@/modules/inventory/labels";

export type CatalogItemRow = {
  id: number;
  name: string;
  category: InventoryCategoryValue;
  unit: string;
  /** "10" / "2,5" — ფორმის ველისთვის */
  minQuantity: string;
  tracksExpiry: boolean;
  note: string | null;
  isActive: boolean;
};

export type SupplierRow = { id: number; name: string; taxId: string | null; phone: string | null; note: string | null; isActive: boolean; receipts: number };

const ALL = "all";
const OTHER_UNIT = "__other";

/** კატალოგი: დასახელებები (დამატება, რედაქტირება, გათიშვა) და მომწოდებლები. */
export function CatalogManager({ items, suppliers }: { items: CatalogItemRow[]; suppliers: SupplierRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState("active");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [editing, setEditing] = useState<CatalogItemRow | "new" | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const data = useMemo(
    () => items.filter((i) => (category === ALL || i.category === category) && (status === ALL || i.isActive === (status === "active"))),
    [items, category, status],
  );

  const columns = useMemo<AppColumnDef<CatalogItemRow>[]>(
    () => [
      { accessorKey: "name", header: "დასახელება", meta: { className: "whitespace-normal" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        id: "category",
        header: "კატეგორია",
        accessorFn: (i) => CATEGORY_LABELS[i.category],
        cell: ({ row }) => <Badge variant="secondary">{CATEGORY_LABELS[row.original.category]}</Badge>,
      },
      { accessorKey: "unit", header: "ერთეული", meta: { className: "hidden sm:table-cell" } },
      {
        id: "min",
        header: "მინ. ნაშთი",
        accessorFn: (i) => Number(i.minQuantity.replace(",", ".")),
        meta: { className: "hidden text-right md:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.minQuantity === "0" ? "—" : row.original.minQuantity}</span>,
      },
      {
        id: "expiry",
        header: "ვადა",
        accessorFn: (i) => (i.tracksExpiry ? 1 : 0),
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (row.original.tracksExpiry ? "აღირიცხება" : <span className="text-muted-foreground">არა</span>),
      },
      {
        id: "status",
        header: "სტატუსი",
        accessorFn: (i) => (i.isActive ? 1 : 0),
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">აქტიური</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">გათიშული</Badge>
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">მოქმედებები</span>,
        enableSorting: false,
        meta: { className: "w-24 text-right" },
        cell: ({ row: { original: i } }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => setEditing(i)} aria-label="რედაქტირება" title="რედაქტირება">
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await setItemActiveAction(i.id, !i.isActive);
                  if (res.ok) toast.success(res.message);
                  else toast.error(res.error);
                })
              }
              aria-label={i.isActive ? "გათიშვა" : "გააქტიურება"}
              title={i.isActive ? "გათიშვა (ფორმებში აღარ ჩანს; ნაშთი და ისტორია რჩება)" : "გააქტიურება"}
              className={i.isActive ? "text-destructive hover:text-destructive" : "text-emerald-600"}
            >
              <Power />
            </Button>
          </div>
        ),
      },
    ],
    [pending],
  );

  const table = useTable({
    features: tableFeatureSet,
    data,
    columns,
    state: { globalFilter: search, sorting, pagination },
    globalFilterFn: (row, _id, q: string) => row.original.name.toLowerCase().includes(q.trim().toLowerCase()),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
  });
  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="ძებნა დასახელებით"
            className="h-9 pl-8"
            aria-label="ძებნა"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelectClient
            id="catalog-category"
            value={category}
            onChange={(v) => {
              setCategory(v);
              resetPage();
            }}
            options={[{ value: ALL, label: "ყველა კატეგორია" }, ...CATEGORIES]}
            className="sm:w-44"
          />
          <NativeSelectClient
            id="catalog-status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              resetPage();
            }}
            options={[
              { value: "active", label: "აქტიური" },
              { value: "inactive", label: "გათიშული" },
              { value: ALL, label: "ყველა" },
            ]}
            className="sm:w-36"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="h-9" onClick={() => setSuppliersOpen(true)}>
            <Truck />
            მომწოდებლები
          </Button>
          <Button size="lg" className="h-9" onClick={() => setEditing("new")}>
            <Plus />
            ახალი დასახელება
          </Button>
        </div>
      </div>

      <DataTable table={table} emptyText="კატალოგი ცარიელია — დაამატეთ დასახელება" />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && <ItemForm key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={suppliersOpen} onOpenChange={setSuppliersOpen}>
        <DialogContent className="sm:max-w-2xl">
          <SuppliersEditor suppliers={suppliers} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useAction() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const formError = result && !result.ok && !result.fieldErrors ? result.error : undefined;
  function run(action: () => Promise<ActionResult>, onSuccess: () => void) {
    startTransition(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) {
        toast.success(res.message);
        onSuccess();
      }
    });
  }
  return { run, pending, errors, formError };
}

function FormAlert({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

function ItemForm({ item, onDone }: { item: CatalogItemRow | null; onDone: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<string>(item?.category ?? "consumable");
  const [unit, setUnit] = useState(item?.unit ?? "ცალი");
  // სიაში არ მყოფი ერთეული (ადრე ხელით ჩაწერილი) — „სხვა“ ველით
  const [customUnit, setCustomUnit] = useState(() => !UNIT_SUGGESTIONS.includes(item?.unit ?? "ცალი"));
  const [minQuantity, setMinQuantity] = useState(item?.minQuantity ?? "0");
  const [tracksExpiry, setTracksExpiry] = useState(item?.tracksExpiry ?? true);
  const [note, setNote] = useState(item?.note ?? "");
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const { run, pending, errors, formError } = useAction();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveItemAction({ id: item?.id, name, category, unit, minQuantity, tracksExpiry, note, isActive }), onDone);
      }}
    >
      <DialogHeader>
        <DialogTitle>{item ? "დასახელების რედაქტირება" : "ახალი დასახელება"}</DialogTitle>
        <DialogDescription>ნაშთი აქ არ იცვლება — მხოლოდ შემოსავლით, გახარჯვით და ჩამოწერით.</DialogDescription>
      </DialogHeader>
      <FormAlert text={formError} />
      <FormField id="item-name" label="დასახელება *" error={errors.name}>
        <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="h-10" autoFocus placeholder="მაგ. შპრიცი 5 მლ" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="item-category" label="კატეგორია *" error={errors.category}>
          <NativeSelectClient
            id="item-category"
            value={category}
            onChange={(v) => {
              setCategory(v);
              // ახალ დასახელებაზე: მედიკამენტს და რეაგენტს ვადა ყოველთვის აქვს, სამეურნეოს — ჩვეულებრივ არა (ჩართვა შეიძლება)
              if (!item && (v === "medication" || v === "reagent")) setTracksExpiry(true);
              if (!item && GENERAL_CATEGORIES.includes(v as InventoryCategoryValue)) setTracksExpiry(false);
            }}
            options={[...CATEGORIES]}
            className="h-10"
          />
        </FormField>
        <FormField id="item-unit" label="საზომი ერთეული *" error={errors.unit}>
          {/* სიიდან ან „სხვა“ — საკუთარი ტექსტით (datalist ავსებულ ველში მხოლოდ დამთხვევას აჩვენებს — არჩევანი არ ჩანდა) */}
          <NativeSelectClient
            id="item-unit"
            value={customUnit ? OTHER_UNIT : unit}
            onChange={(v) => {
              setCustomUnit(v === OTHER_UNIT);
              setUnit(v === OTHER_UNIT ? "" : v);
            }}
            options={[...UNIT_SUGGESTIONS.map((u) => ({ value: u, label: u })), { value: OTHER_UNIT, label: "სხვა (ჩაწერეთ)" }]}
            invalid={Boolean(errors.unit)}
            className="h-10"
          />
          {customUnit && (
            <Input
              aria-label="საზომი ერთეული — საკუთარი"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={20}
              placeholder="მაგ. ბოთლი"
              className="h-10"
              autoFocus
            />
          )}
        </FormField>
      </div>
      <FormField id="item-min" label="მინიმალური ნაშთი" error={errors.minQuantity} hint="ამაზე ნაკლებისას გაფრთხილება მოვა; 0 — გაფრთხილების გარეშე">
        <Input id="item-min" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} inputMode="decimal" className="h-10 max-w-40 tabular-nums" />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={tracksExpiry} onCheckedChange={setTracksExpiry} />
        ვარგისიანობის ვადა აღირიცხება (შემოსავალში სავალდებულოა)
      </label>
      <FormField id="item-note" label="შენიშვნა" error={errors.note}>
        <Textarea id="item-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        აქტიური
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : item ? "შენახვა" : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SuppliersEditor({ suppliers }: { suppliers: SupplierRow[] }) {
  const [editing, setEditing] = useState<SupplierRow | "new" | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>მომწოდებლები</DialogTitle>
        <DialogDescription>მომწოდებელი არ იშლება — ითიშება (ძველ შემოსავლებში რჩება).</DialogDescription>
      </DialogHeader>
      {editing !== null ? (
        <SupplierForm key={editing === "new" ? "new" : editing.id} supplier={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
      ) : (
        <>
          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border text-sm">
            {suppliers.length === 0 && <li className="px-3 py-4 text-center text-muted-foreground">მომწოდებელი ჯერ არ არის</li>}
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={s.isActive ? "font-medium" : "text-muted-foreground line-through"}>{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[s.taxId && `ს/კ ${s.taxId}`, s.phone, `${s.receipts} შემოსავალი`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} aria-label="რედაქტირება">
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button onClick={() => setEditing("new")}>
              <Plus />
              ახალი მომწოდებელი
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SupplierForm({ supplier, onDone }: { supplier: SupplierRow | null; onDone: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [taxId, setTaxId] = useState(supplier?.taxId ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [note, setNote] = useState(supplier?.note ?? "");
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const { run, pending, errors, formError } = useAction();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSupplierAction({ id: supplier?.id, name, taxId, phone, note, isActive }), onDone);
      }}
    >
      <FormAlert text={formError} />
      <FormField id="supplier-name" label="დასახელება *" error={errors.name}>
        <Input id="supplier-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="h-10" autoFocus />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="supplier-tax" label="საიდენტიფიკაციო კოდი" error={errors.taxId}>
          <Input id="supplier-tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} inputMode="numeric" maxLength={11} className="h-10 font-mono" />
        </FormField>
        <FormField id="supplier-phone" label="ტელეფონი" error={errors.phone}>
          <Input id="supplier-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} className="h-10" />
        </FormField>
      </div>
      <FormField id="supplier-note" label="შენიშვნა" error={errors.note}>
        <Textarea id="supplier-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        აქტიური (ჩანს შემოსავლის ფორმაში)
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : supplier ? "შენახვა" : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}
