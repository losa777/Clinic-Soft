"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { type SortingState, useTable } from "@tanstack/react-table";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";
import { Activity, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteSpecialty } from "./actions";
import { SpecialtyDialog } from "./specialty-dialog";

/** doctors — რამდენ ექიმს აქვს მინიჭებული (გათიშულიც). */
export type SpecialtyRow = { id: number; name: string; doctors: number };

const searchFilter = (row: { original: SpecialtyRow }, _columnId: string, query: string) =>
  row.original.name.toLowerCase().includes(query.trim().toLowerCase());

export function SpecialtiesTable({ data }: { data: SpecialtyRow[] }) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [editing, setEditing] = useState<SpecialtyRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<SpecialtyRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog(specialty: SpecialtyRow | null) {
    setEditing(specialty);
    setDialogOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteSpecialty(deleting.id);
      if (res.ok) {
        toast.success(res.message);
        setDeleting(null);
      } else toast.error(res.error);
    });
  }

  const columns = useMemo<AppColumnDef<SpecialtyRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "დასახელება",
        cell: ({ row }) => (
          <Link href={`/admin/specialties/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "doctors",
        header: "ექიმი",
        meta: { className: "w-32 text-right" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.doctors}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">მოქმედებები</span>,
        enableSorting: false,
        meta: { className: "w-36 text-right" },
        cell: ({ row: { original: s } }) => (
          <div className="flex justify-end gap-1">
            <Link
              href={`/admin/specialties/${s.id}`}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              aria-label="მაჩვენებლები"
              title="ვიზიტის მაჩვენებლები"
            >
              <Activity />
            </Link>
            <Button variant="ghost" size="icon" onClick={() => openDialog(s)} aria-label="რედაქტირება" title="რედაქტირება">
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleting(s)}
              disabled={s.doctors > 0}
              aria-label="წაშლა"
              title={s.doctors > 0 ? "სპეციალობა ექიმებს აქვს მინიჭებული" : "წაშლა"}
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
            placeholder="ძებნა დასახელებით"
            className="h-9 pl-8"
            aria-label="ძებნა"
          />
        </div>
        <Button onClick={() => openDialog(null)} size="lg" className="h-9">
          <Plus />
          ახალი სპეციალობა
        </Button>
      </div>

      <DataTable table={table} />

      <SpecialtyDialog open={dialogOpen} onOpenChange={setDialogOpen} specialty={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="სპეციალობის წაშლა"
        description={
          <>
            ნამდვილად გსურთ სპეციალობის <b>{deleting?.name}</b> წაშლა?
          </>
        }
        pending={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
