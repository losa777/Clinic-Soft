import type { Session } from "next-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/appointment-slots";
import { formatGel } from "@/lib/money";
import { ORDER_TYPE_LABELS } from "@/modules/emr/schema";
import { loadDoctorProfile } from "@/modules/emr/server/schedule";
import { type DoctorStats, loadDoctorStats } from "@/modules/emr/server/stats";
import { DateInput, FilterBar, FilterField } from "@/modules/finance/components/filters";
import { periodParams, type SearchParams } from "@/modules/finance/params";

type User = Session["user"];

export const DOCTOR_STATS = "/doctor/stats";

/** ექიმის სტატისტიკა: მხოლოდ საკუთარი ვიზიტები/ჯავშნები/ინვოისები; პერიოდი — ნაგულისხმევად ბოლო 30 დღე. */
export async function DoctorStatsScreen({ user, params }: { user: User; params: SearchParams }) {
  const userId = Number(user.id);
  const profile = await loadDoctorProfile(userId);
  if (!profile) {
    return (
      <Alert>
        <AlertTitle>ექიმის პროფილი არ არის შევსებული</AlertTitle>
        <AlertDescription>ადმინისტრატორმა უნდა მიგანიჭოთ სპეციალობა და სამუშაო განრიგი.</AlertDescription>
      </Alert>
    );
  }
  const { from, to } = periodParams(params, 30);
  const s = await loadDoctorStats({ userId, doctorId: profile.id, from, to });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">სტატისტიკა</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(from)} — {formatDate(to)}
        </p>
      </div>
      <FilterBar action={DOCTOR_STATS}>
        <FilterField label="დან">
          <DateInput name="from" value={from} />
        </FilterField>
        <FilterField label="მდე">
          <DateInput name="to" value={to} />
        </FilterField>
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="ვიზიტი" value={s.visits} hint={s.open ? `დაუსრულებელი: ${s.open}` : "ყველა დასრულებულია"} />
        <Tile label="პაციენტი" value={s.patients} hint={`პირველადი ${s.firstVisits} · განმეორებითი ${s.repeatVisits}`} />
        <Tile label="საშ. ხანგრძლივობა" value={s.avgMinutes === null ? "—" : `${s.avgMinutes} წთ`} hint="დაწყებიდან დასრულებამდე" />
        <Tile label="არ გამოცხადდა" value={s.noShow} hint={`გაუქმებული ჯავშანი: ${s.cancelled}`} />
      </div>

      <VisitsChart data={s.perDay} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ხშირი დიაგნოზები</CardTitle>
          </CardHeader>
          <CardContent>
            {s.diagnoses.length === 0 ? (
              <p className="text-sm text-muted-foreground">დიაგნოზი არ არის.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {s.diagnoses.map((d) => (
                    <tr key={d.code} className="border-b last:border-0">
                      <td className="w-16 py-1.5 font-mono">{d.code}</td>
                      <td className="py-1.5">{d.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>დანიშნულებები და დოკუმენტები</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                {(Object.keys(ORDER_TYPE_LABELS) as (keyof typeof ORDER_TYPE_LABELS)[]).map((t) => (
                  <Row key={t} label={ORDER_TYPE_LABELS[t]} value={s.orders[t] ?? 0} />
                ))}
                <Row label="დანიშნული მედიკამენტი" value={s.prescriptions} />
                <Row label="ხელმოწერილი დოკუმენტი" value={s.documents} />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ინვოისები (ჩემი ვიზიტები)</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                <Row label="ინვოისი" value={s.revenue.invoices} />
                <Row label="ჯამი" value={formatGel(s.revenue.total)} />
                <Row label="დაზღვევა" value={formatGel(s.revenue.insurance)} />
                <Row label="პაციენტი" value={formatGel(s.revenue.patient)} />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}

/**
 * დასრულებული ვიზიტები დღეების მიხედვით: ერთი სერია (primary), სვეტები ბაზიდან, 4px მომრგვალებული თავი,
 * 2px შუალედი, მინიშნება hover/ფოკუსზე; ეკრანის წამკითხველისთვის — ცხრილი.
 */
function VisitsChart({ data }: { data: DoctorStats["perDay"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  const ticks = data.length <= 14 ? data.map((_, i) => i) : [0, Math.floor(data.length / 2), data.length - 1];
  return (
    <Card>
      <CardHeader>
        <CardTitle>დასრულებული ვიზიტები დღეების მიხედვით</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">ამ პერიოდში დასრულებული ვიზიტი არ არის.</p>
        ) : (
          <>
            <div className="flex items-end gap-0.5 border-b border-border" style={{ height: 160 }} aria-hidden>
              {data.map((d) => (
                <div key={d.date} className="group relative flex h-full flex-1 items-end" tabIndex={-1}>
                  <div
                    className="w-full rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{ height: d.count ? `${(d.count / max) * 100}%` : 0, minHeight: d.count ? 3 : 0 }}
                  />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm group-hover:block">
                    {formatDate(d.date)}: <b className="tabular-nums">{d.count}</b>
                  </span>
                </div>
              ))}
            </div>
            <div className="relative mt-1 h-4 text-xs text-muted-foreground" aria-hidden>
              {ticks.map((i) => (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 tabular-nums"
                  style={{ left: `${((i + 0.5) / data.length) * 100}%` }}
                >
                  {formatDate(data[i].date).slice(0, 5)}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              სულ {total} · მაქსიმუმი დღეში {max}
            </p>
            <table className="sr-only">
              <caption>დასრულებული ვიზიტები დღეების მიხედვით</caption>
              <tbody>
                {data.map((d) => (
                  <tr key={d.date}>
                    <th scope="row">{formatDate(d.date)}</th>
                    <td>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
