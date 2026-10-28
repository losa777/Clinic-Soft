import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/appointment-slots";
import { formatGel } from "@/lib/money";
import { cn } from "@/lib/utils";
import { bucketLabel, changePercent } from "@/modules/finance/analytics-format";
import type { Analytics } from "@/modules/finance/server/analytics";
import { Money } from "./invoice-status-badge";
import { TrendChart } from "./trend-chart";

/**
 * ფინანსური ანალიზი: მთავარი მაჩვენებლები (წინა პერიოდთან შედარებით), დინამიკა, ექიმები, კატეგორიები,
 * სერვისები, დაზღვევა, გადახდის მეთოდები. იბეჭდება.
 */
export function AnalyticsReport({ a }: { a: Analytics }) {
  const prev = `${formatDate(a.previous.from)} — ${formatDate(a.previous.to)}`;
  const c = a.current;
  const p = a.prior;
  const billedTotal = Number(c.billed) || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="დარიცხული" value={formatGel(c.billed)} change={changePercent(c.billed, p.billed)} hint={`${c.invoices} ინვოისი, გაუქმებულის გარეშე`} strong />
        <Kpi label="მიღებული (წმინდა)" value={formatGel(c.collected)} change={changePercent(c.collected, p.collected)} hint={`ნაღდი ${formatGel(c.cash)} · ბარათი ${formatGel(c.card)}`} strong />
        <Kpi label="საშუალო ინვოისი" value={formatGel(c.average)} change={changePercent(c.average, p.average)} />
        <Kpi label="პაციენტი" value={String(c.patients)} change={changePercent(c.patients, p.patients)} hint={`ვიზიტი (ინვოისი): ${c.invoices}`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="დაზღვევის წილი" value={formatGel(c.insurance)} change={changePercent(c.insurance, p.insurance)} hint={`${pct(c.insurance, billedTotal)} დარიცხულიდან`} />
        <Kpi label="ფასდაკლება" value={formatGel(c.discount)} change={changePercent(c.discount, p.discount)} invert />
        <Kpi label="დაბრუნებები" value={formatGel(c.refunds)} change={changePercent(c.refunds, p.refunds)} invert />
        <Kpi label="პაციენტის წილი" value={formatGel(c.patient)} change={changePercent(c.patient, p.patient)} />
      </div>
      {/* საწყობი (inventory.reports): შესყიდვა (ზედნადებები) და ხარჯი — სამედიცინო და სამეურნეო ცალ-ცალკე, შესყიდვის ფასით */}
      {c.materials !== null && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="შესყიდვები (საწყობში მიღება)"
            value={formatGel(c.purchases ?? 0)}
            change={changePercent(c.purchases ?? 0, p.purchases ?? 0)}
            hint={`${c.receipts} ზედნადები${c.unpricedLines ? ` · ფასის გარეშე ხაზი: ${c.unpricedLines}` : ""} · ხარჯად ითვლება გახარჯვისას`}
            invert
          />
          <Kpi label="სამედიცინო მასალის ხარჯი" value={formatGel(c.materials)} change={changePercent(c.materials, p.materials ?? 0)} hint="გახარჯვა პაციენტზე/პროცედურაზე, შესყიდვის ფასით" invert />
          <Kpi label="სამეურნეო და საკანცელარიო" value={formatGel(c.supplies ?? 0)} change={changePercent(c.supplies ?? 0, p.supplies ?? 0)} hint="განყოფილებებზე გაცემა, შესყიდვის ფასით" invert />
          <Kpi label="ჩამოწერის ზარალი" value={formatGel(c.writeoffs ?? 0)} change={changePercent(c.writeoffs ?? 0, p.writeoffs ?? 0)} hint="ვადაგასული, დაზიანებული, დაკარგული" invert />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        ↗/↘ — ცვლილება წინა იმავე ხანგრძლივობის პერიოდთან ({prev}). დარიცხული — ინვოისის თარიღით; მიღებული — გადახდის თარიღით (დაბრუნებების გამოკლებით).
      </p>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>დინამიკა {a.grouping === "day" ? "დღეების" : "თვეების"} მიხედვით</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="print:hidden">
            <TrendChart data={a.trend} />
          </div>
          <details className="text-sm print:open">
            <summary className="cursor-pointer text-muted-foreground print:hidden">ცხრილის სახით</summary>
            <Table className="mt-2">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{a.grouping === "day" ? "დღე" : "თვე"}</TableHead>
                  <TableHead className="text-right">დარიცხული</TableHead>
                  <TableHead className="text-right">მიღებული</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.trend
                  .filter((t) => a.grouping === "month" || Number(t.billed) || Number(t.collected))
                  .map((t) => (
                    <TableRow key={t.key}>
                      <TableCell>{bucketLabel(t.key, true)}</TableCell>
                      <TableCell className="text-right"><Money value={t.billed} /></TableCell>
                      <TableCell className="text-right"><Money value={t.collected} /></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </details>
        </CardContent>
      </Card>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>ექიმების მიხედვით</CardTitle>
          <p className="text-sm text-muted-foreground">ინვოისის ექიმით; წილი — დარიცხულიდან</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>ექიმი</TableHead>
                <TableHead className="text-right">ინვოისი</TableHead>
                <TableHead className="hidden text-right sm:table-cell">პაციენტი</TableHead>
                <TableHead className="text-right">დარიცხული</TableHead>
                <TableHead className="hidden w-40 md:table-cell">წილი</TableHead>
                <TableHead className="hidden text-right lg:table-cell">დაზღვევა</TableHead>
                <TableHead className="hidden text-right lg:table-cell">საშუალო</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.doctors.length === 0 && <EmptyRow cols={7} />}
              {a.doctors.map((d) => (
                <TableRow key={d.doctorId ?? "none"}>
                  <TableCell className={cn("font-medium whitespace-normal", d.doctorId === null && "text-muted-foreground")}>{d.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.invoices}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{d.patients}</TableCell>
                  <TableCell className="text-right font-medium"><Money value={d.total} /></TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ShareBar value={Number(d.total) / billedTotal} />
                  </TableCell>
                  <TableCell className="hidden text-right lg:table-cell"><Money value={d.insurance} /></TableCell>
                  <TableCell className="hidden text-right lg:table-cell"><Money value={d.average} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>სერვისების კატეგორიები</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>კატეგორია</TableHead>
                  <TableHead className="text-right">რაოდ.</TableHead>
                  <TableHead className="text-right">დარიცხული</TableHead>
                  <TableHead className="hidden w-32 sm:table-cell">წილი</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.categories.length === 0 && <EmptyRow cols={4} />}
                {a.categories.map((x) => (
                  <TableRow key={x.name}>
                    <TableCell className="whitespace-normal">{x.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.quantity}</TableCell>
                    <TableCell className="text-right"><Money value={x.total} /></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <ShareBar value={Number(x.total) / billedTotal} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>დაზღვევა</CardTitle>
            <p className="text-sm text-muted-foreground">დაზღვევის წილი კომპანიების მიხედვით (გადახდის მდგომარეობა — „დავალიანებები“)</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>კომპანია</TableHead>
                  <TableHead className="text-right">ინვოისი</TableHead>
                  <TableHead className="text-right">დაზღვევის წილი</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.insurers.length === 0 && <EmptyRow cols={3} />}
                {a.insurers.map((x) => (
                  <TableRow key={x.companyId ?? "none"}>
                    <TableCell className={cn("whitespace-normal", x.companyId === null && "text-muted-foreground")}>{x.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.invoices}</TableCell>
                    <TableCell className="text-right">{x.companyId === null ? "—" : <Money value={x.insurance} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {a.insurers.some((x) => x.companyId !== null) && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>ჯამი</TableCell>
                    <TableCell className="text-right"><Money value={c.insurance} /></TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>ყველაზე შემოსავლიანი სერვისები</CardTitle>
          <p className="text-sm text-muted-foreground">პირველი 15 — სრული სია Excel / CSV-ში</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">#</TableHead>
                <TableHead>სერვისი</TableHead>
                <TableHead className="hidden md:table-cell">კატეგორია</TableHead>
                <TableHead className="text-right">რაოდ.</TableHead>
                <TableHead className="text-right">დარიცხული</TableHead>
                <TableHead className="hidden w-32 sm:table-cell">წილი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.services.length === 0 && <EmptyRow cols={6} />}
              {a.services.map((s, i) => (
                <TableRow key={`${s.serviceId}-${i}`}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="max-w-96 whitespace-normal">{s.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{s.category ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.quantity}</TableCell>
                  <TableCell className="text-right"><Money value={s.total} /></TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <ShareBar value={Number(s.total) / billedTotal} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const pct = (part: string | number, whole: number) => `${(Math.round((Number(part) / whole) * 1000) / 10).toLocaleString("ka-GE")}%`;

/**
 * მაჩვენებელი და ცვლილება წინა პერიოდთან. invert — ზრდა არასასურველია (ფასდაკლება, დაბრუნება, ხარჯი):
 * ფერი მიმართულებას არ ცვლის — მხოლოდ ტონს (კარგი/ცუდი), ისარი და ნიშანი ყოველთვის ჩანს.
 */
function Kpi({ label, value, change, hint, strong, invert }: { label: string; value: string; change: number | null; hint?: string; strong?: boolean; invert?: boolean }) {
  const good = change !== null && change !== 0 && (change > 0) !== Boolean(invert);
  const Arrow = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border p-3 break-inside-avoid", strong && "bg-muted/30")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong ? "text-2xl font-semibold" : "text-lg font-semibold")}>{value}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {change === null ? (
          <span title="წინა პერიოდში მონაცემი არ არის">წინასთან შედარება —</span>
        ) : change === 0 ? (
          <span>უცვლელი</span>
        ) : (
          <span className={cn("flex items-center font-medium tabular-nums", good ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
            <Arrow className="size-3.5" aria-hidden />
            {change > 0 ? "+" : ""}
            {change.toLocaleString("ka-GE")}%
            <span className="sr-only">{good ? " (გაუმჯობესება)" : " (გაუარესება)"}</span>
          </span>
        )}
        {hint && <span>{hint}</span>}
      </span>
    </div>
  );
}

/** წილი (0–1): თხელი ზოლი და პროცენტი ტექსტად (ფერი მხოლოდ ზოლზე). */
function ShareBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-r-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${v * 100}%` }} />
      </div>
      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pct(v, 1)}</span>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="h-16 text-center text-muted-foreground">
        ამ პერიოდში მონაცემი არ არის
      </TableCell>
    </TableRow>
  );
}
