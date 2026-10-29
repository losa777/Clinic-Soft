import Link from "next/link";
import { ChevronLeft, ChevronRight, DoorOpen, Star } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, formatDate, isRealDate, tbilisiToday, weekdayName } from "@/lib/appointment-slots";
import { recommendDoctor, sharePercent } from "@/lib/first-visit-balance";
import { saveFirstVisitsOrderAction } from "@/lib/appointment-actions";
import { loadFirstVisitStats } from "@/lib/first-visits";
import { applyOrder } from "@/lib/order";
import { loadIdOrder, PREFERENCE_KEYS } from "@/lib/preferences";
import { SortableGrid } from "@/components/sortable-grid";
import { cn } from "@/lib/utils";

/**
 * პირველადი პაციენტები ექიმების მიხედვით (რეგისტრატურა): დღის ვიზიტებიდან რამდენი იყო პირველადი, წილი სპეციალობის
 * შიგნით და რეკომენდებული ექიმი შემდეგი პირველადი პაციენტისთვის — რომ ერთ ექიმთან არ მიდიოდეს ყველა.
 */
export async function FirstVisitsScreen({ path, rawDate, userId }: { path: string; rawDate: string | string[] | undefined; userId: number }) {
  const today = tbilisiToday();
  const date = typeof rawDate === "string" && isRealDate(rawDate) ? rawDate : today;
  const [stats, order] = await Promise.all([loadFirstVisitStats(date), loadIdOrder(userId, PREFERENCE_KEYS.firstVisitsOrder)]);
  // მომხმარებლის რიგი (drag & drop) — სერვერზევე, რომ გვერდი სწორი რიგით გამოჩნდეს
  const specialties = applyOrder(stats.specialties, order, (s) => s.id);
  const href = (d: string) => (d === today ? path : `${path}?date=${d}`);

  return (
    <section className="flex flex-col gap-4">
      <LiveRefresh topics={["appointments", "invoices"]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">პირველადი პაციენტები</h1>
          <p className="text-sm text-muted-foreground">
            ვისთან რამდენი პირველადი პაციენტია — დააბალანსეთ სპეციალობის ექიმებს შორის. პირველადი: პაციენტს ამ დღემდე კლინიკაში
            ვიზიტი არ ჰქონია.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(addDays(date, -1))} className={buttonVariants({ variant: "outline", size: "icon-lg" })} aria-label="წინა დღე">
            <ChevronLeft />
          </Link>
          <span className="min-w-36 text-center text-sm font-medium">
            {date === today ? "დღეს" : formatDate(date)}, {weekdayName(date)}
          </span>
          <Link href={href(addDays(date, 1))} className={buttonVariants({ variant: "outline", size: "icon-lg" })} aria-label="შემდეგი დღე">
            <ChevronRight />
          </Link>
          {date !== today && (
            <Link href={path} className={buttonVariants({ variant: "ghost", size: "lg" })}>
              დღეს
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="პირველადი პაციენტი" value={stats.first} strong />
        <Stat label="ვიზიტი სულ" value={stats.all} />
        <Stat label="პირველადის წილი" value={`${sharePercent(stats.first, stats.all)}%`} />
      </div>

      {specialties.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">ამ დღეს არცერთი ექიმი არ მუშაობს</p>
      ) : (
        <SortableGrid
          // სვეტები (არა grid): მოკლე ბარათის ქვეშ ცარიელი ადგილი არ რჩება — ბარათები სვეტში ერთმანეთის ქვეშ ლაგდება
          className="gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid"
          onSave={saveFirstVisitsOrderAction}
          items={specialties.map((s) => {
            const recommended = recommendDoctor(s.doctors);
            const working = s.doctors.filter((d) => d.works).length;
            return {
              id: s.id,
              label: s.name,
              content: (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                      {s.name}
                      <span className="text-sm font-normal text-muted-foreground">
                        პირველადი: {s.first}
                        {working > 1 && ` · თანაბარი წილი ≈ ${Math.round(100 / working)}%`}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {recommended && (
                      <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                        <Star className="size-4 shrink-0 fill-current" />
                        შემდეგი პირველადი პაციენტი — <b>{recommended.name}</b> ({recommended.first} პირველადი, {recommended.all} ვიზიტი)
                      </p>
                    )}
                    <ul className="flex flex-col gap-2.5">
                      {s.doctors.map((d) => {
                        const percent = sharePercent(d.first, s.first);
                        return (
                          <li key={d.doctorId} className={cn("flex flex-col gap-1", !d.works && "opacity-60")}>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              <span className="font-medium">{d.name}</span>
                              {d.room && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <DoorOpen className="size-3.5" />
                                  კაბ. {d.room}
                                </span>
                              )}
                              {!d.works && <Badge variant="outline">გრაფიკით არ მუშაობს</Badge>}
                              {recommended?.doctorId === d.doctorId && <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">რეკომენდებული</Badge>}
                              <span className="ml-auto tabular-nums">
                                <b>{d.first}</b> პირველადი · {d.all} ვიზიტი · <b>{percent}%</b>
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${d.name}: ${percent}% პირველადებიდან`}>
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              ),
            };
          })}
        />
      )}
    </section>
  );
}

function Stat({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl tabular-nums", strong ? "font-semibold text-primary" : "font-medium")}>{value}</p>
      </CardContent>
    </Card>
  );
}
