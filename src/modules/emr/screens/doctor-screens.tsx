import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CircleDot, Hourglass, UserRound } from "lucide-react";
import type { Session } from "next-auth";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { PatientSearchInput } from "@/components/patients/patient-search-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { APPOINTMENT_STATUSES } from "@/lib/appointment-schema";
import { addDays, formatDate, isoWeekday, tbilisiToday, weekdayName } from "@/lib/appointment-slots";
import { SEARCH_LIMIT, searchPatients } from "@/lib/patient-records";
import { cn } from "@/lib/utils";
import { loadDoctorProfile, loadOwnAppointment, loadSchedule, type ScheduleRow } from "@/modules/emr/server/schedule";
import { DateInput, FilterBar, FilterField, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { dateParam, param, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { PatientRecord } from "./patient-record";

type User = Session["user"];

export const DOCTOR_HOME = "/doctor";
export const DOCTOR_PATIENTS = "/doctor/patients";

const STATUS_FILTER = [{ value: "", label: "ყველა სტატუსი" }, ...APPOINTMENT_STATUSES];
const VIEWS = [
  { value: "day", label: "დღე" },
  { value: "week", label: "კვირა" },
];

/**
 * ექიმის მთავარი ეკრანი: მარცხნივ დღის (ან კვირის) ვიზიტები — თარიღი და სტატუსის ფილტრი;
 * მარჯვნივ არჩეული ვიზიტის პაციენტის ბარათი (?appointment=). მხოლოდ საკუთარი ჯავშნები.
 */
export async function DoctorHomeScreen({ user, params }: { user: User; params: SearchParams }) {
  const userId = Number(user.id);
  const profile = await loadDoctorProfile(userId);
  if (!profile) {
    return (
      <Alert>
        <AlertTitle>ექიმის პროფილი არ არის შევსებული</AlertTitle>
        <AlertDescription>ადმინისტრატორმა უნდა მიგანიჭოთ სპეციალობა და სამუშაო განრიგი („ადმინი → ექიმები“).</AlertDescription>
      </Alert>
    );
  }

  const today = tbilisiToday();
  const date = dateParam(params.date, today);
  const view = param(params.view) === "week" ? "week" : "day";
  const status = APPOINTMENT_STATUSES.some((s) => s.value === param(params.status)) ? (param(params.status) as AppointmentStatus) : null;
  const from = view === "week" ? addDays(date, 1 - isoWeekday(date)) : date;
  const rows = await loadSchedule({ doctorId: profile.id, from, days: view === "week" ? 7 : 1, status });

  // არჩეული ვიზიტი: შეიძლება სხვა დღისაც იყოს (ბმულიდან) — მხოლოდ საკუთარი
  const selectedId = positiveInt(params.appointment);
  const selected = selectedId ? await loadOwnAppointment(selectedId, userId) : null;
  if (selectedId && !selected) notFound();

  const filters = { date: date === today ? null : date, view: view === "day" ? null : view, status };
  const rowHref = (id: number) => withParams(DOCTOR_HOME, { ...filters, appointment: id });
  const selectedRowId = selected?.context.id ?? null;
  // მომლოდინეები („მობრძანდა“, მათ შორის ცოცხალი რიგი) — ზემოთ, მოსვლის მიხედვით; დანარჩენი — დროის მიხედვით
  const waiting = rows
    .filter((r) => r.status === "arrived")
    .sort((a, b) => (a.arrivedTs ?? Number.MAX_SAFE_INTEGER) - (b.arrivedTs ?? Number.MAX_SAFE_INTEGER));
  const rest = rows.filter((r) => r.status !== "arrived");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {view === "week" ? `კვირა: ${formatDate(from)} — ${formatDate(addDays(from, 6))}` : `${formatDate(date)}, ${weekdayName(date)}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.specialty.name}
            {profile.room && ` · კაბ. ${profile.room}`} · ვიზიტი: {rows.length}
          </p>
        </div>
        <FilterBar action={DOCTOR_HOME}>
          <FilterField label="თარიღი">
            <DateInput name="date" value={date} />
          </FilterField>
          <FilterField label="ხედი">
            <NativeSelect name="view" value={view} options={VIEWS} />
          </FilterField>
          <FilterField label="სტატუსი">
            <NativeSelect name="status" value={status ?? ""} options={STATUS_FILTER} />
          </FilterField>
        </FilterBar>
        <div className="flex gap-2 text-sm">
          <Link href={withParams(DOCTOR_HOME, { ...filters, date: addDays(date, view === "week" ? -7 : -1) })} className="text-primary hover:underline">
            ← წინა
          </Link>
          {date !== today && (
            <Link href={withParams(DOCTOR_HOME, { ...filters, date: null })} className="text-primary hover:underline">
              დღეს
            </Link>
          )}
          <Link href={withParams(DOCTOR_HOME, { ...filters, date: addDays(date, view === "week" ? 7 : 1) })} className="ml-auto text-primary hover:underline">
            შემდეგი →
          </Link>
        </div>
        {waiting.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border-2 border-amber-300 bg-amber-50/50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="flex items-center gap-1.5 px-1 text-sm font-medium text-amber-900 dark:text-amber-200">
              <Hourglass className="size-4" />
              მომლოდინე: {waiting.length}
            </p>
            <ScheduleList rows={waiting} selectedId={selectedRowId} grouped={false} href={rowHref} />
          </div>
        )}
        <ScheduleList rows={rest} selectedId={selectedRowId} grouped={view === "week"} href={rowHref} />
      </aside>

      <section className="min-w-0">
        {selected ? (
          <PatientRecord patientId={selected.patientId} user={user} appointment={selected.context} href={DOCTOR_HOME} params={params} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <CalendarDays className="size-8" />
              აირჩიეთ ვიზიტი სიიდან — გაიხსნება პაციენტის ბარათი.
              <Link href={DOCTOR_PATIENTS} className="text-sm text-primary hover:underline">
                ან მოძებნეთ პაციენტი
              </Link>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

const KIND_LABEL = { first: "პირველადი", repeat: "განმეორებითი" } as const;

function ScheduleList({
  rows,
  selectedId,
  grouped,
  href,
}: {
  rows: ScheduleRow[];
  selectedId: number | null;
  grouped: boolean;
  href: (id: number) => string;
}) {
  if (!rows.length) return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">ვიზიტები არ არის</p>;
  const groups = grouped ? Object.entries(Object.groupBy(rows, (r) => r.date)) : [["", rows] as const];
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([day, list]) => (
        <div key={day} className="flex flex-col gap-1.5">
          {day && (
            <p className="text-xs font-medium text-muted-foreground">
              {formatDate(day)}, {weekdayName(day)}
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {list!.map((r) => (
              <li key={r.id}>
                <Link
                  href={href(r.id)}
                  scroll={false}
                  aria-current={r.id === selectedId ? "true" : undefined}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary",
                    r.id === selectedId && "border-primary bg-primary/5 ring-1 ring-primary",
                    (r.status === "cancelled" || r.status === "no_show") && "opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <b className="tabular-nums">{r.start}</b>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.patient.name}</span>
                    <AppointmentStatusBadge status={r.status} />
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {r.source === "walk_in" ? (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">ცოცხალი რიგი</Badge>
                    ) : (
                      KIND_LABEL[r.visitKind]
                    )}
                    {r.status === "arrived" && r.arrivedAt && <span>მოვიდა {r.arrivedAt}</span>}
                    {r.encounter?.status === "draft" && (
                      <span className="flex items-center gap-1 text-violet-600 dark:text-violet-300">
                        <CircleDot className="size-3" />
                        ჩანაწერი მიმდინარეობს
                      </span>
                    )}
                    {r.comment && <span className="truncate">· {r.comment}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** პაციენტის ძიება: სახელი, გვარი, პირადი ნომერი, ტელეფონი — სერვერზე, ინდექსებით, გვერდებად. */
export async function DoctorPatientSearchScreen({ params }: { params: SearchParams }) {
  const query = param(params.q).replace(/\s+/g, " ");
  const page = positiveInt(params.page) ?? 1;
  const result = await searchPatients(query, { byPhone: true, page });

  return (
    <section className="flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">პაციენტის ძიება</h1>
        <p className="text-sm text-muted-foreground">სახელი და გვარი, პირადი ნომერი ან ტელეფონი</p>
      </div>
      <PatientSearchInput action={DOCTOR_PATIENTS} initialQuery={query} />
      {result.status === "invalid" && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}
      {result.status === "ok" && result.rows.length === 0 && <p className="text-sm text-muted-foreground">„{query}“ — პაციენტი ვერ მოიძებნა.</p>}
      {result.status === "ok" && result.rows.length > 0 && (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border">
            {result.rows.map((p) => (
              <li key={p.id}>
                <Link href={`${DOCTOR_PATIENTS}/${p.id}`} className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-muted/50 sm:grid-cols-4">
                  <span className="flex items-center gap-2 font-medium">
                    <UserRound className="size-4 text-muted-foreground" />
                    {p.lastName} {p.firstName}
                  </span>
                  <span className="font-mono text-muted-foreground">{p.personalId}</span>
                  <span className="text-muted-foreground tabular-nums">{p.birthDate}</span>
                  <span className="text-muted-foreground tabular-nums">{p.phone ?? "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pager
            page={page}
            pageCount={result.hasMore ? page + 1 : page}
            href={(p) => withParams(DOCTOR_PATIENTS, { q: query, page: p > 1 ? p : null })}
          />
          <p className="text-xs text-muted-foreground">გვერდზე {SEARCH_LIMIT} პაციენტი</p>
        </>
      )}
    </section>
  );
}

/** პაციენტის ბარათი ძიებიდან (ჯავშნის გარეშე). */
export async function DoctorPatientScreen({ user, rawId, params }: { user: User; rawId: string; params: SearchParams }) {
  const id = positiveInt(rawId);
  if (!id) notFound();
  return (
    <section className="flex flex-col gap-3">
      <Link href={DOCTOR_PATIENTS} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        ძიება
      </Link>
      <PatientRecord patientId={id} user={user} appointment={null} href={`${DOCTOR_PATIENTS}/${id}`} params={params} />
    </section>
  );
}
