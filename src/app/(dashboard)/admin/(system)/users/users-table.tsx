"use client";

import { useMemo, useState, useTransition } from "react";
import { type ColumnFiltersState, type SortingState, useTable } from "@tanstack/react-table";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";
import { MoreHorizontal, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteUser, setUserActive } from "./actions";
import { UserDialog } from "./user-dialog";

export type UserRow = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roleId: number;
  roleName: string;
  createdAt: number;
  createdAtLabel: string;
};

export type RoleOption = { value: string; label: string };

const ALL = "all";

const STATUS_OPTIONS = [
  { value: ALL, label: "ყველა სტატუსი" },
  { value: "active", label: "აქტიური" },
  { value: "inactive", label: "გათიშული" },
];

const searchFilter = (row: { original: UserRow }, _columnId: string, query: string) => {
  const q = query.trim().toLowerCase();
  const u = row.original;
  return `${u.firstName} ${u.lastName} ${u.lastName} ${u.firstName} ${u.username}`.toLowerCase().includes(q);
};

export function UsersTable({ data, roles, currentUserId }: { data: UserRow[]; roles: RoleOption[]; currentUserId: number }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [pending, startTransition] = useTransition();

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (roleFilter !== ALL) filters.push({ id: "role", value: Number(roleFilter) });
    if (statusFilter !== ALL) filters.push({ id: "status", value: statusFilter === "active" });
    return filters;
  }, [roleFilter, statusFilter]);

  function openDialog(user: UserRow | null) {
    setEditing(user);
    setDialogOpen(true);
  }

  function toggleActive(user: UserRow) {
    startTransition(async () => {
      const res = await setUserActive(user.id, !user.isActive);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteUser(deleting.id);
      if (res.ok) {
        toast.success(res.message);
        setDeleting(null);
      } else toast.error(res.error);
    });
  }

  const columns = useMemo<AppColumnDef<UserRow>[]>(
    () => [
      {
        id: "name",
        header: "სახელი, გვარი",
        accessorFn: (u) => `${u.lastName} ${u.firstName}`,
        cell: ({ row: { original: u } }) => (
          <div className="min-w-0">
            <p className="font-medium">
              {u.firstName} {u.lastName}
              {u.id === currentUserId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(თქვენ)</span>}
            </p>
            <p className="text-xs text-muted-foreground">{u.username}</p>
          </div>
        ),
      },
      {
        id: "role",
        header: "როლი",
        accessorFn: (u) => u.roleName,
        filterFn: (row, _id, roleId: number) => row.original.roleId === roleId,
        cell: ({ row }) => <Badge variant="secondary">{row.original.roleName}</Badge>,
      },
      {
        id: "status",
        header: "სტატუსი",
        accessorFn: (u) => (u.isActive ? 1 : 0),
        filterFn: (row, _id, active: boolean) => row.original.isActive === active,
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">აქტიური</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              გათიშული
            </Badge>
          ),
      },
      {
        id: "createdAt",
        header: "დამატების თარიღი",
        accessorFn: (u) => u.createdAt,
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.createdAtLabel}</span>,
        meta: { className: "hidden md:table-cell" },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">მოქმედებები</span>,
        enableSorting: false,
        meta: { className: "w-12 text-right" },
        cell: ({ row: { original: u } }) => {
          const isSelf = u.id === currentUserId;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="მოქმედებები" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => openDialog(u)}>
                  <Pencil />
                  რედაქტირება
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleActive(u)} disabled={isSelf || pending}>
                  <Power />
                  {u.isActive ? "გათიშვა" : "გააქტიურება"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(u)} disabled={isSelf}>
                  <Trash2 />
                  წაშლა
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currentUserId, pending],
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

  // ფილტრის შეცვლისას პირველ გვერდზე ვბრუნდებით
  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));
  const roleItems = [{ value: ALL, label: "ყველა როლი" }, ...roles];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="ძებნა სახელით, გვარით ან მომხმარებლით"
            className="h-9 pl-8"
            aria-label="ძებნა"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <FilterSelect items={roleItems} value={roleFilter} onChange={(v) => { setRoleFilter(v); resetPage(); }} label="როლი" />
          <FilterSelect items={STATUS_OPTIONS} value={statusFilter} onChange={(v) => { setStatusFilter(v); resetPage(); }} label="სტატუსი" />
        </div>
        <Button onClick={() => openDialog(null)} size="lg" className="h-9">
          <Plus />
          ახალი მომხმარებელი
        </Button>
      </div>

      <DataTable table={table} />

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editing}
        roles={roles}
        isSelf={editing?.id === currentUserId}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="მომხმარებლის წაშლა"
        description={
          <>
            ნამდვილად გსურთ <b>{deleting?.firstName} {deleting?.lastName}</b> ({deleting?.username}) წაშლა? ეს მოქმედება
            შეუქცევადია. თუ მომხმარებელი მხოლოდ დროებით უნდა შეიზღუდოს, გამოიყენეთ „გათიშვა“.
          </>
        }
        pending={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function FilterSelect({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange((v as string | null) ?? ALL)}>
      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
