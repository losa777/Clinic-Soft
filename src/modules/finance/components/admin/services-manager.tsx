"use client";

import { useMemo, useState, useTransition } from "react";
import { type ColumnFiltersState, type SortingState, useTable } from "@tanstack/react-table";
import { FolderTree, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action-result";
import { formatGel } from "@/lib/money";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";
import { cn } from "@/lib/utils";
import { deleteCategoryAction, saveCategoryAction, saveServiceAction, setServiceActiveAction } from "@/modules/finance/actions/service-actions";
import { ORDER_TYPES } from "@/modules/finance/schema";
import { NativeSelectClient } from "../native-select";

export type ServiceRow = {
  id: number;
  code: string | null;
  name: string;
  categoryId: number | null;
  category: string | null;
  price: string;
  isActive: boolean;
  /** ბოლო ფასის ცვლილებები (ახალი პირველი) */
  history: { oldPrice: string; newPrice: string; by: string | null; at: string }[];
};

export type CategoryRow = { id: number; name: string; orderType: OrderTypeValue | null; services: number };
type OrderTypeValue = (typeof ORDER_TYPES)[number]["value"];
const ORDER_TYPE_OPTIONS = [{ value: "", label: "არ ინიშნება" }, ...ORDER_TYPES];

const ALL = "all";

const searchFilter = (row: { original: ServiceRow }, _id: string, query: string) => {
  const q = query.trim().toLowerCase();
  const s = row.original;
  return `${s.name} ${s.code ?? ""} ${s.category ?? ""}`.toLowerCase().includes(q);
};

/** სერვისები: ძებნა, ფილტრი (კატეგორია, სტატუსი), დამატება/რედაქტირება/დეაქტივაცია; კატეგორიების მართვა. */
export function ServicesManager({ data, categories, canManage }: { data: ServiceRow[]; categories: CategoryRow[]; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState("active");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [editing, setEditing] = useState<ServiceRow | null | "new">(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const f: ColumnFiltersState = [];
    if (categoryFilter !== ALL) f.push({ id: "category", value: Number(categoryFilter) });
    if (statusFilter !== ALL) f.push({ id: "status", value: statusFilter === "active" });
    return f;
  }, [categoryFilter, statusFilter]);

  function toggleActive(s: ServiceRow) {
    startTransition(async () => {
      const res = await setServiceActiveAction(s.id, !s.isActive);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  const columns = useMemo<AppColumnDef<ServiceRow>[]>(
    () => [
      {
        id: "code",
        header: "ICD-10",
        accessorFn: (s) => s.code ?? "",
        meta: { className: "w-28 hidden md:table-cell" },
        cell: ({ row }) => (row.original.code ? <span className="font-mono">{row.original.code}</span> : <span className="text-muted-foreground">—</span>),
      },
      {
        accessorKey: "name",
        header: "დასახელება",
        meta: { className: "whitespace-normal" },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "category",
        header: "კატეგორია",
        accessorFn: (s) => s.category ?? "",
        filterFn: (row, _id, categoryId: number) => row.original.categoryId === categoryId,
        cell: ({ row }) => <Badge variant="secondary">{row.original.category ?? "—"}</Badge>,
      },
      {
        id: "price",
        header: "ფასი",
        accessorFn: (s) => Number(s.price),
        meta: { className: "w-32 text-right" },
        cell: ({ row }) => <span className="tabular-nums">{formatGel(row.original.price)}</span>,
      },
      {
        id: "status",
        header: "სტატუსი",
        accessorFn: (s) => (s.isActive ? 1 : 0),
        filterFn: (row, _id, active: boolean) => row.original.isActive === active,
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">აქტიური</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">გათიშული</Badge>
          ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">მოქმედებები</span>,
              enableSorting: false,
              meta: { className: "w-24 text-right" },
              cell: ({ row: { original: s } }) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label="რედაქტირება" title="რედაქტირება">
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleActive(s)}
                    disabled={pending}
                    aria-label={s.isActive ? "გათიშვა" : "გააქტიურება"}
                    title={s.isActive ? "გათიშვა (ახალ ინვოისებში აღარ ჩანს)" : "გააქტიურება"}
                    className={s.isActive ? "text-destructive hover:text-destructive" : "text-emerald-600"}
                  >
                    <Power />
                  </Button>
                </div>
              ),
            } satisfies AppColumnDef<ServiceRow>,
          ]
        : []),
    ],
    [canManage, pending],
  );

  const table = useTable({
    features: tableFeatureSet,
    data,
    columns,
    state: { globalFilter: search, columnFilters, sorting, pagination },
    globalFilterFn: searchFilter,
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
            placeholder="ძებნა დასახელებით, ICD-10 კოდით ან კატეგორიით"
            className="h-9 pl-8"
            aria-label="ძებნა"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelectClient
            id="services-category"
            value={categoryFilter}
            onChange={(v) => {
              setCategoryFilter(v);
              resetPage();
            }}
            options={[{ value: ALL, label: "ყველა კატეგორია" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
            className="sm:w-48"
          />
          <NativeSelectClient
            id="services-status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
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
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-9" onClick={() => setCategoriesOpen(true)}>
              <FolderTree />
              კატეგორიები
            </Button>
            <Button size="lg" className="h-9" onClick={() => setEditing("new")} disabled={!categories.length}>
              <Plus />
              ახალი სერვისი
            </Button>
          </div>
        )}
      </div>

      <DataTable table={table} />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            <ServiceForm
              key={editing === "new" ? "new" : editing.id}
              service={editing === "new" ? null : editing}
              categories={categories}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent className="sm:max-w-lg">
          <CategoriesEditor categories={categories} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useResult() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const formError = result && !result.ok && !result.fieldErrors ? result.error : undefined;
  return { setResult, pending, startTransition, errors, formError };
}

function ServiceForm({ service, categories, onDone }: { service: ServiceRow | null; categories: CategoryRow[]; onDone: () => void }) {
  const [code, setCode] = useState(service?.code ?? "");
  const [name, setName] = useState(service?.name ?? "");
  const [categoryId, setCategoryId] = useState(String(service?.categoryId ?? categories[0]?.id ?? ""));
  const [price, setPrice] = useState(service?.price ?? "");
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const { setResult, pending, startTransition, errors, formError } = useResult();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveServiceAction({ id: service?.id, code, name, categoryId: Number(categoryId) || 0, price, isActive });
      setResult(res);
      if (res.ok) {
        toast.success(res.message);
        onDone();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{service ? "სერვისის რედაქტირება" : "ახალი სერვისი"}</DialogTitle>
        <DialogDescription>ფასის შეცვლა ისტორიაში ჩაიწერება; უკვე შექმნილ ინვოისებს არ ეხება.</DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField id="service-name" label="დასახელება *" error={errors.name}>
          <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" autoFocus />
        </FormField>
        <FormField id="service-code" label="ICD-10" error={errors.code}>
          <Input id="service-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} className="h-10 font-mono" />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="service-category" label="კატეგორია *" error={errors.categoryId}>
          <NativeSelectClient
            id="service-category"
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            className="h-10"
          />
        </FormField>
        <FormField id="service-price" label="ფასი (₾) *" error={errors.price}>
          <Input id="service-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="h-10 tabular-nums" />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        აქტიური (ჩანს ახალ ინვოისებში)
      </label>
      {service && service.history.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <p className="font-medium">ფასის ისტორია</p>
          {service.history.map((h, i) => (
            <p key={i} className="tabular-nums text-muted-foreground">
              {h.at}: {formatGel(h.oldPrice)} → {formatGel(h.newPrice)} · {h.by ?? "—"}
            </p>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : service ? "შენახვა" : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CategoriesEditor({ categories }: { categories: CategoryRow[] }) {
  const [name, setName] = useState("");
  const [orderType, setOrderType] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const { setResult, pending, startTransition, errors, formError } = useResult();

  function remove(id: number) {
    startTransition(async () => {
      const res = await deleteCategoryAction(id);
      setResult(res);
      setDeleting(null);
      if (res.ok) toast.success(res.message);
    });
  }

  function save(input: { id?: number; name: string; orderType: OrderTypeValue | null }, onSuccess: () => void) {
    startTransition(async () => {
      const res = await saveCategoryAction(input);
      setResult(res);
      if (res.ok) {
        toast.success(res.message);
        onSuccess();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>სერვისების კატეგორიები</DialogTitle>
        <DialogDescription>
          დაზღვევის პირობა შეიძლება მთელ კატეგორიაზე მიეთითოს. „დანიშნულება“ — რომელი სიიდან ნიშნავს ექიმი ამ კატეგორიის სერვისებს.
        </DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <ul className="divide-y rounded-lg border text-sm">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 px-3 py-1.5">
            <div className="flex items-center gap-2">
              {renaming?.id === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save({ ...renaming, orderType: c.orderType }, () => setRenaming(null));
                  }}
                >
                  <Input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className="h-8" autoFocus />
                  <Button type="submit" size="sm" disabled={pending}>
                    შენახვა
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate" title={c.name}>
                    {c.name}
                  </span>
                  <NativeSelectClient
                    id={`category-order-${c.id}`}
                    value={c.orderType ?? ""}
                    onChange={(v) => save({ id: c.id, name: c.name, orderType: (v || null) as OrderTypeValue | null }, () => undefined)}
                    options={ORDER_TYPE_OPTIONS}
                    className="h-8 w-44 shrink-0 text-xs"
                  />
                  <span className="w-16 shrink-0 text-xs whitespace-nowrap text-muted-foreground">{c.services} სერვისი</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setRenaming({ id: c.id, name: c.name })} aria-label="გადარქმევა">
                    <Pencil />
                  </Button>
                  {/* სერვისიანი კატეგორია არ იშლება — ჯერ სერვისები სხვაგან (დაზღვევის პირობებს სერვერი ამოწმებს) */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleting(c.id)}
                    disabled={c.services > 0 || pending}
                    aria-label={`წაშლა: ${c.name}`}
                    title={c.services > 0 ? "კატეგორიაში სერვისებია — ჯერ გადაიტანეთ ისინი სხვა კატეგორიაში" : "წაშლა"}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
            {deleting === c.id && (
              <span className="flex items-center justify-end gap-2 pb-1 text-xs">
                წაიშალოს „{c.name}“?
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => remove(c.id)}>
                  წაშლა
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setDeleting(null)}>
                  არა
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ name, orderType: (orderType || null) as OrderTypeValue | null }, () => {
            setName("");
            setOrderType("");
          });
        }}
        noValidate
      >
        <div className="flex-1">
          <FormField id="category-name" label="ახალი კატეგორია" error={errors.name}>
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="მაგ. ლაბორატორია" className="h-9" />
          </FormField>
        </div>
        <NativeSelectClient id="category-order-new" value={orderType} onChange={setOrderType} options={ORDER_TYPE_OPTIONS} className={cn("h-9 w-44", errors.name && "mb-5")} />
        <Button type="submit" disabled={pending} className={errors.name ? "mb-5" : undefined}>
          <Plus />
          დამატება
        </Button>
      </form>
    </div>
  );
}
