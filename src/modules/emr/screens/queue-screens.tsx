import Link from "next/link";
import { FileText } from "lucide-react";
import type { OrderStatus, OrderType } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { documentUrl } from "@/lib/patient-schema";
import { cn } from "@/lib/utils";
import { ProcedureDoneForm, ResultForm, SampleTakenButton } from "@/modules/emr/components/fulfillment-forms";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/modules/emr/schema";
import { loadQueue, type QueueRow } from "@/modules/emr/server/orders";
import { Pager } from "@/modules/finance/components/filters";
import { param, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";

export const LAB_HOME = "/lab";
export const NURSE_HOME = "/nurse";

type Kind = "lab" | "nurse";

const CONFIG: Record<Kind, { home: string; title: string; types: OrderType[]; pending: OrderStatus[]; done: OrderStatus[] }> = {
  lab: { home: LAB_HOME, title: "კვლევები", types: ["lab", "instrumental"], pending: ["ordered", "sample_taken"], done: ["ready"] },
  nurse: { home: NURSE_HOME, title: "პროცედურები", types: ["procedure"], pending: ["ordered"], done: ["done"] },
};

/**
 * ლაბორანტის / ექთნის რიგი: „მიმდინარე“ — ძველი პირველი (FIFO), „შესრულებული“ — ახალი პირველი. 30 ჩანაწერი გვერდზე.
 * ექიმის დანიშნულებები აქ ავტომატურად ჩნდება; შესრულებისას ექიმი შეტყობინებას იღებს.
 */
export async function OrderQueueScreen({ kind, params }: { kind: Kind; params: SearchParams }) {
  const c = CONFIG[kind];
  const view = param(params.view) === "done" ? "done" : "pending";
  const queue = await loadQueue({ types: c.types, statuses: view === "done" ? c.done : c.pending, page: positiveInt(params.page) ?? 1 });
  const viewHref = (v: string, page?: number) => withParams(c.home, { view: v === "pending" ? null : v, page: page && page > 1 ? page : null });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{c.title}</h1>
          <p className="text-sm text-muted-foreground">ექიმების დანიშნულებები — {view === "pending" ? "შესასრულებელი, რიგის მიხედვით" : "შესრულებული"}</p>
        </div>
        <nav className="flex gap-1 rounded-lg border bg-muted/50 p-1 text-sm" aria-label="ხედი">
          {[
            { value: "pending", label: "მიმდინარე" },
            { value: "done", label: "შესრულებული" },
          ].map((v) => (
            <Link
              key={v.value}
              href={viewHref(v.value)}
              aria-current={view === v.value ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5", view === v.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      {queue.rows.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">{view === "pending" ? "რიგი ცარიელია." : "შესრულებული ჯერ არაფერია."}</CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {queue.rows.map((r) => (
            <QueueItem key={r.id} row={r} kind={kind} />
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">სულ: {queue.total}</p>
      <Pager page={queue.page} pageCount={queue.pageCount} href={(p) => viewHref(view, p)} />
    </section>
  );
}

function QueueItem({ row: r, kind }: { row: QueueRow; kind: Kind }) {
  const active = r.status === "ordered" || r.status === "sample_taken";
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.name}</p>
          <p className="text-muted-foreground">
            {r.patient.name} · <span className="font-mono">{r.patient.personalId}</span> · დაბ. {r.patient.birthDate}
          </p>
          <p className="text-xs text-muted-foreground">
            {kind === "lab" && `${ORDER_TYPE_LABELS[r.type]} · `}დანიშნა: {r.orderedBy ?? "—"} · {r.orderedAt}
          </p>
          {r.note && <p className="mt-1">შენიშვნა: {r.note}</p>}
        </div>
        <Badge variant={active ? "secondary" : "default"}>{ORDER_STATUS_LABELS[r.status]}</Badge>
      </div>

      {active ? (
        <div className="flex flex-wrap items-start gap-2">
          {kind === "nurse" ? (
            <ProcedureDoneForm orderId={r.id} />
          ) : (
            <>
              {r.type === "lab" && r.status === "ordered" && <SampleTakenButton orderId={r.id} />}
              <ResultForm orderId={r.id} />
            </>
          )}
        </div>
      ) : (
        <div className="border-t pt-2">
          <p className="text-xs text-muted-foreground">
            {r.performedBy ?? "—"} · {r.performedAt}
          </p>
          {r.resultText && <p className="whitespace-pre-line">{r.resultText}</p>}
          {r.resultDocumentId && (
            <a href={documentUrl(r.resultDocumentId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <FileText className="size-4" />
              შედეგის ფაილი
            </a>
          )}
        </div>
      )}
    </li>
  );
}
