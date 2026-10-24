"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { type ColumnFiltersState, type SortingState, useTable } from "@tanstack/react-table";
import { CalendarCog, Search } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type AppColumnDef, tableFeatureSet } from "@/lib/table";

/**
 * status: active — ჯავშნისთვის ხელმისაწვდომია; inactive — პროფილი ან მომხმარებელი გათიშულია;
 * none — პროფილი (სპეციალობა, განრიგი) ჯერ არ აქვს; not-doctor — პროფილი აქვს, მაგრამ როლი შეეცვალა.
 */
export type DoctorRow = {
  userId: number;
  name: string;
  username: string;
  specialty: string | null;
  duration: number | null;
  room: string | null;
  schedule: string;
  status: "active" | "inactive" | "none" | "not-doctor";
};

const ALL = "all";

const STATUS_OPTIONS = [
  { value: ALL, label: "ყველა" },
  { value: "active", label: "აქტიური" },
  { value: "inactive", label: "გათიშული" },
  { value: "none", label: "არ არის შევსებული" },
];

const searchFilter = (row: { original: DoctorRow }, _columnId: string, query: string) => {
  const q = query.trim().toLowerCase();
  const d = row.original;
  return `${d.name} ${d.username} ${d.specialty ?? ""}`.toLowerCase().includes(q);
};

function StatusBadge({ status }: { status: DoctorRow["status"] }) {
  if (status === "active") {
    return <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">აქტიური</Badge>;
  }
  if (status === "none") {
    return <Badge className="bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">არ არის შევსებული</Badge>;
  }
  if (status === "not-doctor") return <Badge variant="destructive">როლი არ არის „ექიმი“</Badge>;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      გათიშული
    </Badge>
  );
}

export function DoctorsTable({ data }: { data: DoctorRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const columnFilters = useMemo<ColumnFiltersState>(
    () => (statusFilter === ALL ? [] : [{ id: "status", value: statusFilter }]),
    [statusFilter],
  );

  const columns = useMemo<AppColumnDef<DoctorRow>[]>(
    () => [
      {
        id: "name",
        header: "ექიმი",
        accessorFn: (d) => d.name,
        cell: ({ row: { original: d } }) => (
          <div className="min-w-0">
            <p className="font-medium">{d.name}</p>
            <p className="text-xs text-muted-foreground">{d.username}</p>
          </div>
        ),
      },
      {
        id: "specialty",
        header: "სპეციალობა",
        accessorFn: (d) => d.specialty ?? "",
        cell: ({ row }) => row.original.specialty ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: "visit",
        header: "ვიზიტი / კაბინეტი",
        accessorFn: (d) => d.duration ?? 0,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row: { original: d } }) =>
          d.duration ? (
            <span className="tabular-nums">
              {d.duration} წთ{d.room && <span className="text-muted-foreground"> · კაბ. {d.room}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "schedule",
        header: "განრიგი",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell max-w-sm whitespace-normal" },
        cell: ({ row }) =>
          row.original.schedule ? (
            <span className="text-xs tabular-nums">{row.original.schedule}</span>
          ) : (
            <span className="text-xs text-muted-foreground">არ მუშაობს / არ არის მითითებული</span>
          ),
      },
      {
        id: "status",
        header: "სტატუსი",
        accessorFn: (d) => d.status,
        filterFn: (row, _id, status: string) => row.original.status === status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">მოქმედებები</span>,
        enableSorting: false,
        meta: { className: "w-32 text-right" },
        cell: ({ row: { original: d } }) => (
          <Link href={`/admin/doctors/${d.userId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <CalendarCog />
            {d.status === "none" ? "შევსება" : "რედაქტირება"}
          </Link>
        ),
      },
    ],
    [],
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="ძებნა სახელით, მომხმარებლით ან სპეციალობით"
            className="h-9 pl-8"
            aria-label="ძებნა"
          />
        </div>
        <Select
          items={STATUS_OPTIONS}
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter((v as string | null) ?? ALL);
            resetPage();
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-52" aria-label="სტატუსი">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable table={table} emptyText="ექიმები ვერ მოიძებნა — დაამატეთ მომხმარებელი „ექიმის“ როლით" />
    </div>
  );
}
