"use client";

import { useMemo, useState, useTransition } from "react";
import { type SortingState, useTable } from "@tanstack/react-table";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteRole } from "./actions";
import { RoleDialog } from "./role-dialog";

export type RoleRow = { id: number; code: string; name: string; userCount: number; isSystem: boolean };

export function RolesTable({ data }: { data: RoleRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog(role: RoleRow | null) {
    setEditing(role);
    setDialogOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteRole(deleting.id);
      if (res.ok) {
        toast.success(res.message);
        setDeleting(null);
      } else toast.error(res.error);
    });
  }

  const columns = useMemo<AppColumnDef<RoleRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "სახელი",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "code",
        header: "კოდი",
        cell: ({ row }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.code}</code>,
      },
      {
        accessorKey: "userCount",
        header: "მომხმარებლები",
        cell: ({ row }) => <span className="tabular-nums">{row.original.userCount}</span>,
      },
      {
        id: "type",
        header: "ტიპი",
        accessorFn: (r) => (r.isSystem ? 0 : 1),
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) =>
          row.original.isSystem ? (
            <Badge variant="secondary">
              <Lock />
              სისტემური
            </Badge>
          ) : (
            <Badge variant="outline">დამატებითი</Badge>
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">მოქმედებები</span>,
        enableSorting: false,
        meta: { className: "w-24 text-right" },
        cell: ({ row: { original: r } }) => {
          const deleteHint = r.isSystem
            ? "სისტემური როლის წაშლა შეუძლებელია"
            : r.userCount > 0
              ? "როლს ჰყავს მომხმარებლები"
              : "წაშლა";
          return (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => openDialog(r)} aria-label="რედაქტირება" title="რედაქტირება">
                <Pencil />
              </Button>
              <span title={deleteHint}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleting(r)}
                  disabled={r.isSystem || r.userCount > 0}
                  aria-label={deleteHint}
                >
                  <Trash2 />
                </Button>
              </span>
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useTable({
    features: tableFeatureSet,
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => openDialog(null)} size="lg" className="h-9">
          <Plus />
          ახალი როლი
        </Button>
      </div>

      <DataTable table={table} />

      <RoleDialog open={dialogOpen} onOpenChange={setDialogOpen} role={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="როლის წაშლა"
        description={
          <>
            ნამდვილად გსურთ როლის <b>{deleting?.name}</b> ({deleting?.code}) წაშლა?
          </>
        }
        pending={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
