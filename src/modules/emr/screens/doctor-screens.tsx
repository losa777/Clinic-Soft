import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CalendarX,
  CircleCheck,
  CircleDot,
  Clock,
  FilePen,
  FlaskConical,
  Hourglass,
  ListTodo,
  type LucideIcon,
  Stethoscope,
  UserRound,
} from "lucide-react";
import type { Session } from "next-auth";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { PatientSearchInput } from "@/components/patients/patient-search-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_STATUSES } from "@/lib/appointment-schema";
import { addDays, formatDate, isoWeekday, tbilisiParts, tbilisiToday, weekdayName } from "@/lib/appointment-slots";
import { SEARCH_LIMIT, searchPatients } from "@/lib/patient-records";
import { cn } from "@/lib/utils";
import { ElapsedTime } from "@/modules/emr/components/elapsed-time";
import { minutesText } from "@/modules/emr/minutes-text";
import {
  type DoctorAttention,
  loadDoctorAttention,
  loadDoctorProfile,
  loadOwnAppointment,
  loadSchedule,
  RESULTS_DAYS,
  type ScheduleRow,
} from "@/modules/emr/server/schedule";
import { DateInput, FilterBar, FilterField, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { dateParam, param, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { PatientRecord } from "./patient-record";
import { LiveRefresh } from "@/components/live-refresh";

type User = Session["user"];

export const DOCTOR_HOME = "/doctor";
export const DOCTOR_PATIENTS = "/doctor/patients";
export const DOCTOR_VISITS = "/doctor/visits";

/** ვიზიტის გვერდი (პაციენტის ბარათი მთელ სიგანეზე); tab — ჩანართი (visit, studies, orders...). */
export const visitUrl = (appointmentId: number, tab?: string) => withParams(`${DOCTOR_VISITS}/${appointmentId}`, { tab });

const STATUS_FILTER = [{ value: "", label: "ყველა სტატუსი" }, ...APPOINTMENT_STATUSES];
const VIEWS = [
  { value: "day", label: "დღე" },
  { value: "week", label: "კვირა" },
];

/**
 * ექიმის მთავარი ეკრანი — დღის (ან კვირის) ვიზიტები ორ სვეტად:
 * - ზემოთ: შეჯამება (სულ, მომლოდინე, მიღებაზე, დასრულებული, გაუქმდა) და დღის პროგრესი;
 * - მარცხნივ „შესასრულებელი“: მიღებაზე → მომლოდინე (ბოლოს მოსული ზემოთ, ლოდინის დროით) → დაგეგმილი (შემდეგი / დაგვიანებული);
 * - მარჯვნივ „შესრულებული“: დასრულებული (ბოლო ზემოთ, ხანგრძლივობა, კვლევების პასუხები) → გაუქმებული / არ გამოცხადდა;
 * - ქვემოთ „ყურადღება“: წინა დღეების დაუსრულებელი ჩანაწერები და ბოლო დღეების კვლევის პასუხები.
 * ვიზიტზე დაჭერით პაციენტის ბარათი ცალკე გვერდზე იხსნება (visitUrl). მხოლოდ საკუთარი ჯავშნები.
 * ძველი მისამართი ?appointment=<id> (შეტყობინებებში) — გადამისამართდება ვიზიტის გვერდზე.
 */
export async function DoctorHomeScreen({ user, params }: { user: User; params: SearchParams }) {
  const legacy = positiveInt(params.appointment);
  if (legacy) redirect(withParams(`${DOCTOR_VISITS}/${legacy}`, { tab: param(params.tab) || null, hpage: param(params.hpage) || null }));
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
  const [rows, attention] = await Promise.all([
    loadSchedule({ doctorId: profile.id, from, days: view === "week" ? 7 : 1, status }),
    loadDoctorAttention(userId, today),
  ]);

  const filters = { date: date === today ? null : date, view: view === "day" ? null : view, status };
  const grouped = view === "week";
  const nowMinutes = tbilisiParts(new Date()).minutes;
  const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

  const inProgress = rows.filter((r) => r.status === "in_progress");
  // ბოლოს მოსული — ზემოთ
  const waiting = rows.filter((r) => r.status === "arrived").sort((a, b) => (b.arrivedTs ?? 0) - (a.arrivedTs ?? 0));
  const booked = rows.filter((r) => r.status === "booked");
  // დასრულებული — ბოლოს დასრულებული ზემოთ
  const completed = rows
    .filter((r) => r.status === "completed")
    .sort((a, b) => (b.encounter?.completedAt ?? b.start).localeCompare(a.encounter?.completedAt ?? a.start) || b.date.localeCompare(a.date));
  const dropped = rows.filter((r) => r.status === "cancelled" || r.status === "no_show");

  // დაგეგმილი: დრო გავიდა და არ მოსულა — „დაგვიანებულია“; დღევანდელი პირველი მომავალი — „შემდეგი“
  const overdue = (r: ScheduleRow) => r.date < today || (r.date === today && minutesOf(r.start) < nowMinutes);
  const nextId = booked.find((r) => r.date === today && !overdue(r))?.id ?? null;

  const durations = completed.flatMap((r) => (r.encounter?.minutes ? [r.encounter.minutes] : []));
  const avgMinutes = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const planned = rows.length - dropped.length;
  const progress = planned > 0 ? Math.round((completed.length / planned) * 100) : 0;
  const todo = inProgress.length + waiting.length + booked.length;

  const rowProps = { href: (id: number) => visitUrl(id), grouped };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <LiveRefresh topics={["appointments"]} doctorUserId={userId} />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">
            {view === "week" ? `კვირა: ${formatDate(from)} — ${formatDate(addDays(from, 6))}` : `${formatDate(date)}, ${weekdayName(date)}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.specialty.name}
            {profile.room && ` · კაბ. ${profile.room}`}
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
      </div>
      <div className="flex gap-3 text-sm">
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

      {/* შეჯამება */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile icon={CalendarDays} label={view === "week" ? "კვირის ვიზიტები" : "დღის ვიზიტები"} value={rows.length} />
        <StatTile icon={Hourglass} label="მომლოდინე" value={waiting.length} tone={waiting.length ? "amber" : undefined} />
        <StatTile icon={Stethoscope} label="მიღებაზე" value={inProgress.length} tone={inProgress.length ? "violet" : undefined} />
        <StatTile icon={CircleCheck} label="დასრულებული" value={completed.length} hint={avgMinutes ? `საშ. ${minutesText(avgMinutes)}` : undefined} tone="emerald" />
        <StatTile icon={CalendarX} label="გაუქმდა / არ მოვიდა" value={dropped.length} />
      </div>
      {planned > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="შესრულებული ვიზიტები">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="tabular-nums">
            შესრულებულია {completed.length} / {planned} ({progress}%)
          </span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* შესასრულებელი */}
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-3" aria-labelledby="todo-title">
          <h2 id="todo-title" className="flex items-center gap-2 font-semibold">
            <ListTodo className="size-4 text-primary" />
            შესასრულებელი
            <Badge variant="secondary" className="ml-auto tabular-nums">{todo}</Badge>
          </h2>
          {inProgress.length > 0 && (
            <Group title="მიღებაზე" tone="violet" icon={Stethoscope}>
              <ScheduleList rows={inProgress} {...rowProps} detail={(r) => <InProgressDetail row={r} live={r.date === today} />} />
            </Group>
          )}
          {waiting.length > 0 && (
            <Group title={`მომლოდინე: ${waiting.length}`} tone="amber" icon={Hourglass}>
              <ScheduleList
                rows={waiting}
                {...rowProps}
                grouped={false}
                detail={(r) =>
                  r.arrivedAt && (
                    <>
                      <span>მოვიდა {r.arrivedAt}</span>
                      {r.arrivedTs && r.date === today && <ElapsedTime since={r.arrivedTs} prefix="· ელოდება" warnAt={15} alertAt={30} />}
                    </>
                  )
                }
              />
            </Group>
          )}
          <Group title={`დაგეგმილი: ${booked.length}`} icon={Clock}>
            <ScheduleList
              rows={booked}
              {...rowProps}
              empty={rows.length === 0 ? "ვიზიტები არ არის" : todo === 0 ? "ყველა ვიზიტი შესრულებულია 🎉" : "დაგეგმილი ვიზიტები აღარ არის"}
              detail={(r) =>
                r.id === nextId ? (
                  <Badge className="h-4 bg-sky-600 px-1.5 text-[10px] text-white">შემდეგი</Badge>
                ) : overdue(r) ? (
                  <span className="font-medium text-amber-700 dark:text-amber-300">დრო გავიდა — არ მობრძანებულა</span>
                ) : null
              }
            />
          </Group>
        </section>

        {/* შესრულებული */}
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-3" aria-labelledby="done-title">
          <h2 id="done-title" className="flex items-center gap-2 font-semibold">
            <CircleCheck className="size-4 text-emerald-600" />
            შესრულებული
            <Badge variant="secondary" className="ml-auto tabular-nums">{completed.length}</Badge>
          </h2>
          <ScheduleList rows={completed} {...rowProps} empty="დასრულებული ვიზიტები ჯერ არ არის" detail={(r) => <CompletedDetail row={r} />} />
          {dropped.length > 0 && (
            <Group title={`გაუქმებული / არ გამოცხადდა: ${dropped.length}`} icon={CalendarX}>
              <ScheduleList rows={dropped} {...rowProps} showStatus />
            </Group>
          )}
        </section>
      </div>

      <AttentionPanel attention={attention} />
      {rows.length === 0 && (
        <Link href={DOCTOR_PATIENTS} className="text-center text-sm text-primary hover:underline">
          პაციენტის მოძებნა
        </Link>
      )}
    </div>
  );
}

const TONES = {
  amber: "border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200",
  violet: "border-violet-300 bg-violet-50/60 text-violet-900 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-200",
  emerald: "border-emerald-300 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200",
} as const;

function StatTile({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: number; hint?: string; tone?: keyof typeof TONES }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", tone ? TONES[tone] : "bg-card")}>
      <Icon className="size-5 shrink-0 opacity-70" aria-hidden />
      <div className="min-w-0 leading-tight">
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs opacity-80">{label}</p>
        {hint && <p className="truncate text-[11px] opacity-70">{hint}</p>}
      </div>
    </div>
  );
}

function Group({ title, icon: Icon, tone, children }: { title: string; icon: LucideIcon; tone?: "amber" | "violet"; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", tone && cn("rounded-xl border-2 p-2", TONES[tone]))}>
      <p className={cn("flex items-center gap-1.5 px-1 text-sm font-medium", !tone && "text-muted-foreground")}>
        <Icon className="size-4" aria-hidden />
        {title}
      </p>
      {children}
    </div>
  );
}

/** live — დღევანდელი ვიზიტი: გასული დრო (წინა დღეების „დაუსრულებელზე“ საათები აზრს კარგავს). */
function InProgressDetail({ row: r, live }: { row: ScheduleRow; live: boolean }) {
  if (!r.encounter) return null;
  return (
    <>
      <span>მიღება დაიწყო {r.encounter.startedAt}</span>
      {live && <ElapsedTime since={r.encounter.startedTs} prefix="·" warnAt={30} />}
    </>
  );
}

function CompletedDetail({ row: r }: { row: ScheduleRow }) {
  return (
    <>
      {r.encounter?.completedAt && (
        <span>
          დასრულდა {r.encounter.completedAt}
          {r.encounter.minutes && ` · ${minutesText(r.encounter.minutes)}`}
        </span>
      )}
      {r.orders.ready > 0 && (
        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <FlaskConical className="size-3" />
          მზადაა: {r.orders.ready}
        </span>
      )}
      {r.orders.pending > 0 && (
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <FlaskConical className="size-3" />
          მოლოდინში: {r.orders.pending}
        </span>
      )}
    </>
  );
}

/** წინა დღეების დაუსრულებელი ჩანაწერები და ბოლო დღეების კვლევის პასუხები — ყოველთვის (ცარიელზე — შესაბამისი ტექსტი). */
function AttentionPanel({ attention: a }: { attention: DoctorAttention }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-3" aria-labelledby="drafts-title">
        <h2 id="drafts-title" className="flex items-center gap-2 font-semibold">
          <FilePen className="size-4 text-violet-600" />
          დაუსრულებელი ჩანაწერები
          {a.draftCount > 0 && <Badge className="ml-auto bg-violet-600 tabular-nums text-white">{a.draftCount}</Badge>}
        </h2>
        {a.drafts.length ? (
          <ul className="flex flex-col divide-y text-sm">
            {a.drafts.map((d) => (
              <li key={d.appointmentId}>
                <Link href={visitUrl(d.appointmentId)} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate font-medium">{d.patient}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{d.when}</span>
                </Link>
              </li>
            ))}
            {a.draftCount > a.drafts.length && <li className="px-1 pt-1.5 text-xs text-muted-foreground">და კიდევ {a.draftCount - a.drafts.length}</li>}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">წინა დღეების ყველა ვიზიტი დასრულებულია</p>
        )}
      </section>
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-3" aria-labelledby="results-title">
        <h2 id="results-title" className="flex items-center gap-2 font-semibold">
          <FlaskConical className="size-4 text-emerald-600" />
          კვლევების პასუხები ({RESULTS_DAYS} დღე)
          {a.pendingOrders > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">მოლოდინში: {a.pendingOrders}</span>
          )}
        </h2>
        {a.results.length ? (
          <ul className="flex flex-col divide-y text-sm">
            {a.results.map((r) => (
              <li key={r.id}>
                <Link href={visitUrl(r.appointmentId, "orders")} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.patient}</span>
                    <span className="text-muted-foreground"> · {r.service}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.when}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ბოლო დღეებში ახალი პასუხები არ არის</p>
        )}
      </section>
    </div>
  );
}

const KIND_LABEL = { first: "პირველადი", repeat: "განმეორებითი" } as const;

function ScheduleList({
  rows,
  grouped,
  href,
  detail,
  showStatus,
  empty = "ვიზიტები არ არის",
}: {
  rows: ScheduleRow[];
  grouped: boolean;
  href: (id: number) => string;
  /** სექციის დამატებითი ინფორმაცია სტრიქონზე (ლოდინის დრო, ხანგრძლივობა...) */
  detail?: (row: ScheduleRow) => React.ReactNode;
  /** სტატუსის ნიშანი (სექცია სტატუსს თავად არ აჩვენებს) */
  showStatus?: boolean;
  empty?: string;
}) {
  if (!rows.length) return <p className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{empty}</p>;
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
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:border-primary",
                    (r.status === "cancelled" || r.status === "no_show") && "opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <b className="tabular-nums">{r.start}</b>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.patient.name}</span>
                    {showStatus && <AppointmentStatusBadge status={r.status} />}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {r.source === "walk_in" ? (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">ცოცხალი რიგი</Badge>
                    ) : (
                      KIND_LABEL[r.visitKind]
                    )}
                    {detail?.(r)}
                    {r.encounter?.status === "draft" && r.status !== "in_progress" && (
                      <span className="flex items-center gap-1 text-violet-600 dark:text-violet-300">
                        <CircleDot className="size-3" />
                        ჩანაწერი მიმდინარეობს
                      </span>
                    )}
                    {/* ცოცხალი რიგის ავტომატური კომენტარი ნიშანს იმეორებს */}
                    {r.comment && !(r.source === "walk_in" && r.comment.startsWith("ცოცხალი რიგი")) && <span className="truncate">· {r.comment}</span>}
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
      <PatientSearchInput action={DOCTOR_PATIENTS} initialQuery={query} patientHref={DOCTOR_PATIENTS} />
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

/**
 * ვიზიტის გვერდი: პაციენტის ბარათი მთელ სიგანეზე (ვიზიტის ფორმა, ისტორია, კვლევები, დანიშნულებები, დოკუმენტები).
 * მხოლოდ საკუთარი ჯავშანი; უკან — იმ დღის განრიგზე.
 */
export async function DoctorVisitScreen({ user, rawId, params }: { user: User; rawId: string; params: SearchParams }) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const visit = await loadOwnAppointment(id, Number(user.id));
  if (!visit) notFound();
  const date = visit.context.date;
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={withParams(DOCTOR_HOME, { date: date === tbilisiToday() ? null : date })}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" />
        დღის განრიგი · {formatDate(date)}, {visit.context.start}
      </Link>
      <PatientRecord patientId={visit.patientId} user={user} appointment={visit.context} href={visitUrl(id)} params={params} />
    </div>
  );
}
