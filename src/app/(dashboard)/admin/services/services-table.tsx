"use client";

import { useMemo, useState, useTransition } from "react";
import { type SortingState, useTable } from "@tanstack/react-table";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteService } from "./actions";
import { ServiceDialog } from "./service-dialog";

/** code: ICD-10 კოდი (არასავალდებულო, null — არ არის მითითებული). price: "25.50" (ფორმისთვის და სორტირებისთვის), priceLabel: "25,50 ₾" (ჩვენებისთვის). */
export type ServiceRow = { id: number; code: string | null; name: string; price: string; priceLabel: string };

const searchFilter = (row: { original: ServiceRow }, _columnId: string, query: string) => {
  const q = query.trim().toLowerCase();
  return row.original.name.toLowerCase().includes(q) || !!row.original.code?.toLowerCase().includes(q);
};

export function ServicesTable({ data }: { data: ServiceRow[] }) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<ServiceRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog(service: ServiceRow | null) {
    setEditing(service);
    setDialogOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteService(deleting.id);
      if (res.ok) {
        toast.success(res.message);
        setDeleting(null);
      } else toast.error(res.error);
    });
  }

  const columns = useMemo<AppColumnDef<ServiceRow>[]>(
    () => [
      {
        id: "code",
        header: "ICD-10",
        accessorFn: (s) => s.code ?? "",
        meta: { className: "w-36" },
        cell: ({ row }) =>
          row.original.code ? (
            <span className="font-mono">{row.original.code}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "name",
        header: "დასახელება",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "price",
        header: "ფასი",
        accessorFn: (s) => Number(s.price),
        meta: { className: "w-36 text-right" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.priceLabel}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">მოქმედებები</span>,
        enableSorting: false,
        meta: { className: "w-24 text-right" },
        cell: ({ row: { original: s } }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openDialog(s)} aria-label="რედაქტირება" title="რედაქტირება">
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleting(s)}
              aria-label="წაშლა"
              title="წაშლა"
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useTable({
    features: tableFeatureSet,
    data,
    columns,
    state: { globalFilter: search, sorting, pagination },
    globalFilterFn: searchFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            placeholder="ძებნა ICD-10 კოდით ან დასახელებით"
            className="h-9 pl-8"
            aria-label="ძებნა"
          />
        </div>
        <Button onClick={() => openDialog(null)} size="lg" className="h-9">
          <Plus />
          ახალი სერვისი
        </Button>
      </div>

      <DataTable table={table} />

      <ServiceDialog open={dialogOpen} onOpenChange={setDialogOpen} service={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="სერვისის წაშლა"
        description={
          <>
            ნამდვილად გსურთ სერვისის <b>{deleting?.name}</b> წაშლა?
          </>
        }
        pending={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
