"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { type SortingState, useTable } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatGel } from "@/lib/money";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import { SegmentedChoice } from "@/components/segmented-choice";
import { CATEGORIES, CATEGORY_LABELS, GROUP_FILTERS, type GroupFilter, isMedical, STOCK_STATUSES, type StockStatusFilter } from "@/modules/inventory/labels";
import type { InventoryRoutes } from "@/modules/inventory/routes";
import type { StockRow } from "@/modules/inventory/server/stock";
import { formatQuantity } from "@/modules/inventory/stock";
import { ExpiryBadge, LevelBadge } from "./badges";

const ALL = "all";

const inGroup = (category: StockRow["category"], group: GroupFilter) => group === "all" || (group === "medical") === isMedical(category);

function matchesStatus(r: StockRow, status: StockStatusFilter) {
  if (status === "inactive") return !r.isActive;
  if (!r.isActive) return false;
  const low = r.level !== "ok";
  const expiry = r.expiry === "expired" || r.expiry === "expiring";
  if (status === "low") return low;
  if (status === "expiry") return expiry;
  if (status === "attention") return low || expiry;
  return true;
}

/**
 * ნაშთები: ძებნა, კატეგორია, მდგომარეობა (მცირე ნაშთი, ვადა). showValue — ღირებულება (inventory.reports).
 * writeoffHref — ჩამოწერის გვერდი (inventory.manage): ვადაგასული ნაშთის გვერდით „ჩამოწერა“ ბმული.
 * showGroups — გადამრთველი „ყველა / სამედიცინო / სამეურნეო“ (სამეურნეოს უფლების გარეშე rows უკვე მხოლოდ სამედიცინოა).
 */
export function StockTable({
  rows,
  routes,
  showValue,
  initialStatus,
  initialGroup,
  showGroups,
  writeoffHref,
}: {
  rows: StockRow[];
  routes: InventoryRoutes;
  showValue: boolean;
  initialStatus: StockStatusFilter;
  initialGroup: GroupFilter;
  showGroups: boolean;
  writeoffHref: string | null;
}) {
  const [group, setGroup] = useState<GroupFilter>(initialGroup);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [status, setStatus] = useState<StockStatusFilter>(initialStatus);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });

  const data = useMemo(
    () =>
      rows.filter(
        (r) => inGroup(r.category, group) && (category === ALL || r.category === category) && matchesStatus(r, status),
      ),
    [rows, group, category, status],
  );

  const columns = useMemo<AppColumnDef<StockRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "დასახელება",
        meta: { className: "whitespace-normal" },
        cell: ({ row: { original: r } }) => (
          <Link href={`${routes.items}/${r.id}`} className="font-medium text-primary hover:underline">
            {r.name}
          </Link>
        ),
      },
      {
        id: "category",
        header: "კატეგორია",
        accessorFn: (r) => CATEGORY_LABELS[r.category],
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => <Badge variant="secondary">{CATEGORY_LABELS[row.original.category]}</Badge>,
      },
      {
        id: "quantity",
        header: "ნაშთი",
        accessorFn: (r) => r.usable,
        meta: { className: "text-right" },
        cell: ({ row: { original: r } }) => (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-medium tabular-nums">
              {formatQuantity(r.usable)} <span className="text-xs font-normal text-muted-foreground">{r.unit}</span>
            </span>
            {r.expired > 0 && (
              <span className="text-xs text-destructive tabular-nums">
                + {formatQuantity(r.expired)} ვადაგასული
                {writeoffHref && (
                  <>
                    {" · "}
                    <Link href={`${writeoffHref}?mode=writeoff&item=${r.id}`} className="font-medium underline-offset-2 hover:underline">
                      ჩამოწერა
                    </Link>
                  </>
                )}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "min",
        header: "მინიმუმი",
        accessorFn: (r) => r.minQuantity,
        meta: { className: "hidden text-right sm:table-cell" },
        cell: ({ row: { original: r } }) =>
          r.minQuantity > 0 ? <span className="tabular-nums text-muted-foreground">{formatQuantity(r.minQuantity)}</span> : "—",
      },
      {
        id: "level",
        header: "მდგომარეობა",
        accessorFn: (r) => (r.level === "out" ? 0 : r.level === "low" ? 1 : 2),
        cell: ({ row: { original: r } }) =>
          r.isActive ? <LevelBadge level={r.level} /> : <Badge variant="outline" className="text-muted-foreground">გათიშული</Badge>,
      },
      {
        id: "expiry",
        header: "უახლოესი ვადა",
        accessorFn: (r) => r.nextExpiry ?? "9999",
        cell: ({ row: { original: r } }) =>
          r.tracksExpiry ? <ExpiryBadge date={r.nextExpiry} status={r.nextExpiryStatus} /> : <span className="text-muted-foreground">—</span>,
      },
      ...(showValue
        ? [
            {
              id: "value",
              header: "ღირებულება",
              accessorFn: (r) => r.valueTetri,
              meta: { className: "hidden text-right lg:table-cell" },
              cell: ({ row }) => <span className="tabular-nums">{formatGel(row.original.valueTetri / 100)}</span>,
            } satisfies AppColumnDef<StockRow>,
          ]
        : []),
    ],
    [routes, showValue, writeoffHref],
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
  const total = data.reduce((s, r) => s + r.valueTetri, 0);

  return (
    <div className="flex flex-col gap-3">
      {showGroups && (
        <div className="max-w-md">
          <SegmentedChoice
            id="stock-group"
            items={GROUP_FILTERS}
            value={group}
            onChange={(g) => {
              setGroup(g);
              // სხვა ჯგუფის კატეგორია აღარ გამოდგება
              if (category !== ALL && !inGroup(category as StockRow["category"], g)) setCategory(ALL);
              resetPage();
            }}
          />
        </div>
      )}
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
            id="stock-category"
            value={category}
            onChange={(v) => {
              setCategory(v);
              resetPage();
            }}
            options={[{ value: ALL, label: "ყველა კატეგორია" }, ...CATEGORIES.filter((c) => inGroup(c.value, group) && (showGroups || isMedical(c.value)))]}
            className="sm:w-44"
          />
          <NativeSelectClient
            id="stock-status"
            value={status}
            onChange={(v) => {
              setStatus(v as StockStatusFilter);
              resetPage();
            }}
            options={[...STOCK_STATUSES]}
            className="sm:w-56"
          />
        </div>
      </div>
      <DataTable table={table} emptyText="დასახელებები ვერ მოიძებნა" />
      {showValue && (
        <p className="text-right text-sm text-muted-foreground">
          ნაშთის ღირებულება (შესყიდვის ფასით, ფილტრის მიხედვით): <b className="text-foreground tabular-nums">{formatGel(total / 100)}</b>
        </p>
      )}
    </div>
  );
}
