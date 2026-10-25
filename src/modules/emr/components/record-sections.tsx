import Link from "next/link";
import { FileImage, FileText, FlaskConical, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { documentUrl, formatFileSize } from "@/lib/patient-schema";
import { cn } from "@/lib/utils";
import { allergySeverityLabel, ORDER_STATUS_LABELS } from "@/modules/emr/schema";
import type { loadEncounterHistory, loadFiles, loadStudies, PatientCard } from "@/modules/emr/server/patient-card";
import { Pager } from "@/modules/finance/components/filters";
import { SurgicalBadge } from "./surgical-badge";

/** ალერგიები — ბარათის ზედა ნაწილში, ყოველთვის თვალსაჩინოდ (წითლად). */
export function AllergyBanner({ allergies }: { allergies: NonNullable<PatientCard>["allergies"] }) {
  if (!allergies.length) {
    return <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">ალერგია არ არის ჩაწერილი</p>;
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-destructive bg-destructive/10 px-3 py-2 text-destructive">
      <TriangleAlert className="size-5 shrink-0" />
      <b className="mr-1">ალერგია:</b>
      {allergies.map((a) => (
        <span key={a.id} className="rounded-md bg-destructive px-2 py-0.5 text-sm font-semibold text-white">
          {a.substance}
          <span className="font-normal opacity-90">
            {" "}
            ({allergySeverityLabel(a.severity)}
            {a.reaction && `, ${a.reaction}`})
          </span>
        </span>
      ))}
    </div>
  );
}

type History = Awaited<ReturnType<typeof loadEncounterHistory>>;

/** წინა ვიზიტები ქრონოლოგიურად (ახალი პირველი), ყველა ექიმის ჩანაწერით. */
export function EncounterHistory({ history, pageHref }: { history: History; pageHref: (page: number) => string }) {
  if (!history.total) return <p className="text-sm text-muted-foreground">ვიზიტის ჩანაწერი ჯერ არ არის.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">სულ: {history.total}</p>
      <ol className="flex flex-col gap-3">
        {history.rows.map((e) => (
          <li key={e.id}>
            <Card size="sm" className={cn(e.own && "ring-1 ring-primary/30")}>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <b className="tabular-nums">{e.at}</b>
                  <span>
                    {e.doctor}
                    {e.specialty && <span className="text-muted-foreground"> · {e.specialty}</span>}
                  </span>
                  {e.own && <Badge variant="secondary">ჩემი</Badge>}
                  {e.surgical && <SurgicalBadge uploaded={e.portalUploaded} />}
                  <Badge variant={e.status === "completed" ? "outline" : "secondary"} className="ml-auto">
                    {e.status === "completed" ? "დასრულებული" : "მიმდინარე"}
                  </Badge>
                </p>
                {e.diagnoses.length > 0 && (
                  <p>
                    {e.diagnoses.map((d) => (
                      <span key={d.code} className={cn("mr-3 inline-block", d.primary && "font-medium")}>
                        <span className="font-mono">{d.code}</span> {d.name}
                        {d.primary ? " (ძირითადი)" : d.complication ? " (გართულება)" : ""}
                      </span>
                    ))}
                  </p>
                )}
                {e.measurements.length > 0 && <Field label="მაჩვენებლები" value={e.measurements.join("\n")} />}
                <Field label="ჩივილები" value={e.complaints} />
                <Field label="ობიექტური გასინჯვა" value={e.examination} />
                <Field label="მკურნალობის გეგმა" value={e.treatmentPlan} />
                <Field label="რეკომენდაციები" value={e.recommendations} />
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <Pager page={history.page} pageCount={history.pageCount} href={pageHref} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="whitespace-pre-line">
      <span className="text-muted-foreground">{label}: </span>
      {value}
    </p>
  );
}

type Studies = Awaited<ReturnType<typeof loadStudies>>;

/** ლაბორატორიული და ინსტრუმენტული კვლევები შედეგებით. */
export function StudiesList({ studies }: { studies: Studies }) {
  if (!studies.length) return <p className="text-sm text-muted-foreground">კვლევა ჯერ არ დანიშნულა.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {studies.map((s) => (
        <li key={s.id} className="rounded-lg border px-3 py-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <FlaskConical className="size-4 text-muted-foreground" />
            <b>{s.name}</b>
            <span className="text-muted-foreground">{s.type === "lab" ? "ლაბორატორია" : "ინსტრუმენტული"}</span>
            <Badge variant={s.status === "ready" ? "default" : "secondary"} className="ml-auto">
              {ORDER_STATUS_LABELS[s.status]}
            </Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            დანიშნა: {s.orderedBy ?? "—"} · {s.orderedAt}
            {s.readyAt && ` · შედეგი: ${s.readyAt}`}
          </p>
          {s.resultText && <p className="mt-1 whitespace-pre-line">{s.resultText}</p>}
          {s.file && (
            <a href={documentUrl(s.file.id)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
              <FileText className="size-4" />
              {s.file.title}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

type Files = Awaited<ReturnType<typeof loadFiles>>;

/** პაციენტის ფაილები (სურათები, PDF) — ნახვა ახალ ჩანართში. */
export function FilesList({ files }: { files: Files }) {
  if (!files.length) return <p className="text-sm text-muted-foreground">ფაილი არ არის ატვირთული.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {files.map((f) => {
        const Icon = f.mimeType.startsWith("image/") ? FileImage : FileText;
        return (
          <li key={f.id}>
            <Link
              href={documentUrl(f.id)}
              target="_blank"
              className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {f.type} · {formatFileSize(f.sizeBytes)} · {f.uploadedAt}
                  {f.uploadedBy && ` · ${f.uploadedBy}`}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
