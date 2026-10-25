"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudUpload, FileSpreadsheet, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { markUploadedAction } from "@/modules/reporting/actions";

export type CaseRow = {
  encounterId: number;
  patientId: number;
  visitDate: string;
  name: string;
  personalId: string;
  doctor: string;
  diagnosis: string;
  form100: string;
  surgical: boolean;
  uploadedAt: string;
};

/**
 * შემთხვევები: მონიშვნა → Excel (მხოლოდ მონიშნული, შენახული სვეტებით), „ატვირთულია“ / „ისევ ასატვირთი“ (reporting.export).
 * exportHref — ექსპორტის მისამართი (scope-ით); მონიშნულები ემატება ?ids=-ით.
 */
export function CasesTable({
  rows,
  patientHref,
  canMark,
  exportHref,
  columnsHref,
}: {
  rows: CaseRow[];
  patientHref: string;
  canMark: boolean;
  exportHref: string;
  columnsHref: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.encounterId));

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function mark(uploaded: boolean) {
    startTransition(async () => {
      try {
        const res = await markUploadedAction([...selected], uploaded);
        if (!res.ok) return void toast.error(res.error ?? "მოქმედება ვერ შესრულდა");
        toast.success(res.message);
        setSelected(new Set());
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canMark && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">მონიშნულია: {selected.size}</span>
          {selected.size ? (
            <a href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}ids=${[...selected].join(",")}`} className={buttonVariants({ size: "lg" })} download>
              <FileSpreadsheet />
              Excel — მონიშნული ({selected.size})
            </a>
          ) : (
            <Button size="lg" disabled>
              <FileSpreadsheet />
              Excel — მონიშნული
            </Button>
          )}
          <Link href={columnsHref} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            სვეტების არჩევა
          </Link>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <Button size="lg" variant="outline" disabled={!selected.size || pending} onClick={() => mark(true)}>
            <CloudUpload />
            ატვირთულად მონიშვნა
          </Button>
          <Button size="lg" variant="outline" disabled={!selected.size || pending} onClick={() => mark(false)}>
            <Undo2 />
            ისევ ასატვირთი
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {canMark && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="ყველას მონიშვნა"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.encounterId)))}
                    className="size-4 accent-primary"
                  />
                </TableHead>
              )}
              <TableHead>ვიზიტი</TableHead>
              <TableHead>პაციენტი</TableHead>
              <TableHead>პირადი ნომერი</TableHead>
              <TableHead>ექიმი</TableHead>
              <TableHead>ძირითადი დიაგნოზი</TableHead>
              <TableHead>ფორმა 100</TableHead>
              <TableHead>პორტალი</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.encounterId} data-state={selected.has(r.encounterId) ? "selected" : undefined}>
                {canMark && (
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`მონიშვნა: ${r.name}, ${r.visitDate}`}
                      checked={selected.has(r.encounterId)}
                      onChange={() => toggle(r.encounterId)}
                      className="size-4 accent-primary"
                    />
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap tabular-nums">{r.visitDate}</TableCell>
                <TableCell>
                  <Link href={`${patientHref}/${r.patientId}`} className="font-medium text-primary hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono">{r.personalId}</TableCell>
                <TableCell>{r.doctor}</TableCell>
                <TableCell className="max-w-72 truncate" title={r.diagnosis}>
                  {r.diagnosis || "—"}
                </TableCell>
                <TableCell className="tabular-nums">{r.form100 || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  {r.uploadedAt ? (
                    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" title={r.uploadedAt}>
                      ატვირთულია
                    </Badge>
                  ) : r.surgical ? (
                    <Badge className="bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">ასატვირთი</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
