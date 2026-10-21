import Link from "next/link";
import { Ban, CalendarClock, ClipboardPlus, Hospital, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatGel, fromTetri, toTetri } from "@/lib/money";
import { paymentMethodLabel, type VisitRow, visitTypeLabel } from "@/lib/visit-schema";
import { VisitActionsBar } from "./visit-actions-bar";

/** პაციენტის ვიზიტების ისტორია: შეჯამება (გაუქმებულის გარეშე) და თითოეული ვიზიტის დეტალები. */
export function PatientVisits({
  visits,
  newVisitHref,
  editHref,
}: {
  visits: VisitRow[];
  /** null — ამ როლს მიღება არ აქვს */
  newVisitHref: string | null;
  /** რედაქტირების მისამართის თარგი: `{visitId}` იცვლება ვიზიტის id-ით */
  editHref: string;
}) {
  if (!visits.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">პაციენტს ვიზიტი ჯერ არ ჰქონია.</p>
          {newVisitHref && (
            <Link href={newVisitHref} className={buttonVariants({ size: "lg" })}>
              <ClipboardPlus />
              პაციენტის მიღება
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const active = visits.filter((v) => !v.cancelled);
  const sum = (pick: (v: VisitRow) => string) => fromTetri(active.reduce((s, v) => s + toTetri(pick(v)), 0));
  const debt = sum((v) => v.debt);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="ვიზიტი" value={String(active.length)} />
        <Stat label="სულ ღირებულება" value={formatGel(sum((v) => v.totalAmount))} />
        <Stat label="გადახდილი" value={formatGel(sum((v) => v.paidAmount))} />
        <Stat label="დავალიანება" value={formatGel(debt)} danger={toTetri(debt) > 0} />
      </dl>

      <ul className="flex flex-col gap-3">
        {visits.map((v) => (
          <li key={v.id}>
            <VisitCard visit={v} editHref={editHref.replace("{visitId}", String(v.id))} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card size="sm">
      <CardContent>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`text-xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</dd>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ visit: v }: { visit: VisitRow }) {
  if (v.cancelled) {
    return (
      <Badge variant="outline" className="ml-auto text-muted-foreground">
        <Ban />
        გაუქმებულია
      </Badge>
    );
  }
  if (toTetri(v.debt) > 0) {
    return (
      <Badge variant="destructive" className="ml-auto">
        დავალიანება: {formatGel(v.debt)}
      </Badge>
    );
  }
  return (
    <Badge className="ml-auto bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">გადახდილია</Badge>
  );
}

function VisitCard({ visit: v, editHref }: { visit: VisitRow; editHref: string }) {
  return (
    <Card className={v.cancelled ? "opacity-70" : undefined}>
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={`flex items-center gap-1.5 ${v.cancelled ? "line-through" : ""}`}>
            <CalendarClock className="size-4 text-muted-foreground" />
            <span className="tabular-nums">{v.visitAt}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Stethoscope className="size-4 text-muted-foreground" />
            {v.doctorName}
          </span>
          <span className="flex items-center gap-1.5">
            <Hospital className="size-4 text-muted-foreground" />
            {visitTypeLabel(v.visitType)}
          </span>
          <StatusBadge visit={v} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {v.cancelled && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm">
            <b>გაუქმების მიზეზი:</b> {v.cancelled.reason}
            <span className="block text-xs text-muted-foreground">
              გააუქმა: {v.cancelled.by ?? "—"} · {v.cancelled.at}
            </span>
          </p>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-24 pb-1 font-normal">ICD-10</th>
              <th className="pb-1 font-normal">სერვისი</th>
              <th className="pb-1 text-right font-normal">ფასი</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {v.services.map((s, i) => (
              <tr key={i}>
                <td className="py-1.5 font-mono text-muted-foreground">{s.code ?? "—"}</td>
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-right tabular-nums">{formatGel(s.price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t font-medium">
            <tr>
              <td colSpan={2} className="pt-1.5">
                ჯამი
              </td>
              <td className="pt-1.5 text-right tabular-nums">{formatGel(v.totalAmount)}</td>
            </tr>
            <tr>
              <td colSpan={2}>გადახდილი</td>
              <td className="text-right tabular-nums">{formatGel(v.paidAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {v.payments.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">გადახდები</p>
            <ul className="flex flex-col gap-0.5 text-sm">
              {v.payments.map((p, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3">
                  <span className="text-muted-foreground">
                    {p.createdAt} · {p.createdBy ?? "—"}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{paymentMethodLabel(p.method)}</Badge>
                    <span className="font-medium tabular-nums">{formatGel(p.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {v.comment && <p className="rounded-lg bg-muted/50 px-3 py-2 whitespace-pre-line">{v.comment}</p>}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            დაარეგისტრირა: {v.createdBy ?? "—"} · {v.createdAt}
            {v.updated && (
              <span className="block">
                შეცვალა: {v.updated.by ?? "—"} · {v.updated.at}
              </span>
            )}
          </p>
          {!v.cancelled && <VisitActionsBar visitId={v.id} debt={v.debt} editHref={editHref} />}
        </div>
      </CardContent>
    </Card>
  );
}
