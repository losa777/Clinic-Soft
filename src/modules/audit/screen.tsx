import Link from "next/link";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/appointment-slots";
import { cn } from "@/lib/utils";
import { DateInput, ExportLink, FilterBar, FilterField, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { param, periodParams, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { ACTION_TONE, actionLabel, AUDIT_PRESETS, type AuditPreset, entityLabel } from "./labels";
import { type AuditFilter, auditSummary, findAuditPatient, listAudit, loadAuditOptions } from "./server";

/**
 * აუდიტის ჟურნალი: ვინ, როდის, რა ნახა/შეცვალა. მხოლოდ სანახავად — ჩანაწერები არ იცვლება და არ იშლება.
 * patientHref — პაციენტის ბარათის ბმული (როლს ბარათის გვერდი თუ არ აქვს — null).
 */
export async function AuditScreen({ base, params, patientHref }: { base: string; params: SearchParams; patientHref: ((id: number) => string) | null }) {
  const period = periodParams(params, 7);
  const pidText = param(params.pid).replace(/\D/g, "");
  const patient = await findAuditPatient({ id: positiveInt(params.patient), personalId: pidText || undefined });
  const preset = AUDIT_PRESETS.some((p) => p.value === param(params.preset)) ? (param(params.preset) as AuditPreset) : "";
  const filter: AuditFilter = {
    ...period,
    userId: positiveInt(params.user),
    // პირადი ნომერი არასწორია — ცარიელი შედეგი (და არა მთელი ჟურნალი)
    patientId: patient?.id ?? (pidText || positiveInt(params.patient) ? -1 : null),
    entity: param(params.entity) || null,
    action: param(params.action) || null,
    preset,
    page: positiveInt(params.page) ?? 1,
  };
  const [result, options, summary] = await Promise.all([listAudit(filter), loadAuditOptions(), auditSummary(period.from, period.to)]);
  const query = {
    from: period.from,
    to: period.to,
    user: filter.userId,
    patient: patient?.id ?? null,
    pid: patient ? null : pidText || null,
    entity: filter.entity,
    action: filter.action,
    preset: preset || null,
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">აუდიტი</h1>
          <p className="text-sm text-muted-foreground">
            ვინ, როდის, რა ნახა და შეცვალა · {formatDate(period.from)} — {formatDate(period.to)}. ჩანაწერები არ იცვლება და არ იშლება.
          </p>
        </div>
        <ExportLink href={withParams("/api/audit", query)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ჩანაწერი პერიოდში" value={summary.total} />
        <Stat
          label="წარუმატებელი შესვლა / ბლოკი"
          value={summary.failedLogins}
          danger={summary.failedLogins > 0}
          href={summary.failedLogins > 0 ? withParams(base, { from: period.from, to: period.to, preset: "failed_logins" }) : null}
        />
        <Stat label="პაციენტის მონაცემების ნახვა" value={summary.patientViews} href={withParams(base, { from: period.from, to: period.to, preset: "patient_access" })} />
        <Stat label="პაციენტი (განსხვავებული)" value={summary.patients} />
      </div>

      <FilterBar action={base}>
        <FilterField label="დან">
          <DateInput name="from" value={period.from} />
        </FilterField>
        <FilterField label="მდე">
          <DateInput name="to" value={period.to} />
        </FilterField>
        <FilterField label="ჯგუფი">
          <NativeSelect name="preset" value={preset} options={[...AUDIT_PRESETS]} className="max-w-56" />
        </FilterField>
        <FilterField label="თანამშრომელი">
          <NativeSelect
            name="user"
            value={filter.userId ? String(filter.userId) : ""}
            options={[{ value: "", label: "ყველა" }, ...options.users.map((u) => ({ value: String(u.id), label: u.name }))]}
            className="max-w-56"
          />
        </FilterField>
        {patient ? (
          <FilterField label="პაციენტი">
            <span className="flex h-9 items-center gap-1 rounded-lg border bg-background px-2.5 text-sm">
              <input type="hidden" name="patient" value={patient.id} />
              {patient.firstName} {patient.lastName} <span className="font-mono text-xs text-muted-foreground">{patient.personalId}</span>
              <Link href={withParams(base, { ...query, patient: null })} aria-label="პაციენტის ფილტრის მოხსნა" className="ml-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </Link>
            </span>
          </FilterField>
        ) : (
          <FilterField label="პაციენტის პირადი №">
            <Input name="pid" defaultValue={pidText} inputMode="numeric" maxLength={11} placeholder="11 ციფრი" className="h-9 w-36 font-mono" />
          </FilterField>
        )}
        <FilterField label="ობიექტი">
          <NativeSelect
            name="entity"
            value={filter.entity ?? ""}
            options={[{ value: "", label: "ყველა" }, ...options.entities.map((e) => ({ value: e, label: entityLabel(e) })).sort((a, b) => a.label.localeCompare(b.label, "ka"))]}
            className="max-w-48"
          />
        </FilterField>
        <FilterField label="მოქმედება">
          <NativeSelect
            name="action"
            value={filter.action ?? ""}
            options={[{ value: "", label: "ყველა" }, ...options.actions.map((a) => ({ value: a, label: actionLabel(a) })).sort((a, b) => a.label.localeCompare(b.label, "ka"))]}
            className="max-w-48"
          />
        </FilterField>
      </FilterBar>
      {pidText && !patient && <p className="text-sm text-destructive">პაციენტი პირადი ნომრით {pidText} ვერ მოიძებნა</p>}

      <p className="text-sm text-muted-foreground">ნაპოვნია: {result.count}</p>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10">დრო</TableHead>
              <TableHead className="h-10">თანამშრომელი</TableHead>
              <TableHead className="h-10">მოქმედება</TableHead>
              <TableHead className="h-10">პაციენტი</TableHead>
              <TableHead className="hidden h-10 lg:table-cell">დეტალები</TableHead>
              <TableHead className="hidden h-10 xl:table-cell">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  ჩანაწერი ვერ მოიძებნა
                </TableCell>
              </TableRow>
            )}
            {result.rows.map((r) => {
              const tone = ACTION_TONE[r.action];
              return (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="tabular-nums whitespace-nowrap">{r.at}</TableCell>
                  <TableCell>
                    {r.userId ? (
                      <Link href={withParams(base, { ...query, user: r.userId, page: null })} className="hover:underline">
                        {r.user ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">უცნობი</span>
                    )}
                    {r.role && <span className="block text-xs text-muted-foreground">{r.role}</span>}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col items-start gap-0.5">
                      <Badge
                        variant={tone === "danger" ? "destructive" : tone === "view" ? "outline" : "secondary"}
                        className={cn(tone === "change" && "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300")}
                      >
                        {actionLabel(r.action)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {entityLabel(r.entity)}
                        {r.entityId ? ` #${r.entityId}` : ""}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.patientId ? (
                      <>
                        <Link href={withParams(base, { ...query, patient: r.patientId, pid: null, page: null })} className="hover:underline">
                          {r.patient}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {r.personalId}
                          {patientHref && (
                            <>
                              {" · "}
                              <Link href={patientHref(r.patientId)} className="font-sans text-primary hover:underline">
                                ბარათი
                              </Link>
                            </>
                          )}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-96 text-sm whitespace-normal text-muted-foreground lg:table-cell">{r.details ?? "—"}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">{r.ip ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pager page={result.page} pageCount={result.pageCount} href={(p) => withParams(base, { ...query, page: p })} />
    </section>
  );
}

function Stat({ label, value, danger, href }: { label: string; value: number; danger?: boolean; href?: string | null }) {
  const body = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-semibold tabular-nums", danger && "text-destructive")}>{value.toLocaleString("ka-GE")}</span>
    </>
  );
  const className = "flex flex-col gap-1 rounded-xl border p-3";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-muted/50")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
