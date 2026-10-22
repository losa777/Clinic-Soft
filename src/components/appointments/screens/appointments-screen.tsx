import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { invoiceUrl, newInvoiceUrl } from "@/modules/finance/routes";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadDayAppointments, loadDoctorFilterOptions } from "@/lib/appointment-records";
import type { AppointmentRoutes } from "@/lib/appointment-routes";
import { formatDate, isRealDate, tbilisiToday, weekdayName } from "@/lib/appointment-slots";
import { cn } from "@/lib/utils";
import { AppointmentFilters } from "../appointment-filters";
import { AppointmentRowActions } from "../appointment-row-actions";
import { AppointmentStatusBadge } from "../appointment-status-badge";

type Params = Record<string, string | string[] | undefined>;

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const positiveInt = (v: string) => (/^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null);

/** დღის ჯავშნების სია: ფილტრი თარიღით და ექიმით, გვერდებად (?date=&doctor=&page=). */
export async function AppointmentsScreen({ routes, params }: { routes: AppointmentRoutes; params: Params }) {
  const today = tbilisiToday();
  const date = isRealDate(param(params.date)) ? param(params.date) : today;
  const doctorId = positiveInt(param(params.doctor));
  const page = positiveInt(param(params.page)) ?? 1;

  const [day, doctors, user] = await Promise.all([
    loadDayAppointments({ date, doctorId, page }),
    loadDoctorFilterOptions(),
    requireUser(),
  ]);
  const canInvoice = can(user, "invoices.create");
  const canViewInvoice = can(user, "invoices.view");

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (date !== today) qs.set("date", date);
    if (doctorId) qs.set("doctor", String(doctorId));
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${routes.list}?${s}` : routes.list;
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">დღის ჯავშნები</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(date)}, {weekdayName(date)}
            {date === today && " (დღეს)"} · სულ: {day.total}
          </p>
        </div>
        <Link href={routes.booking} className={buttonVariants({ size: "lg" })}>
          <CalendarPlus />
          ახალი ჯავშანი
        </Link>
      </div>

      <AppointmentFilters action={routes.list} date={date} today={today} doctorId={doctorId} doctors={doctors} />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 w-28">დრო</TableHead>
              <TableHead className="h-10">პაციენტი</TableHead>
              <TableHead className="h-10 hidden md:table-cell">ექიმი</TableHead>
              <TableHead className="h-10">სტატუსი</TableHead>
              <TableHead className="h-10 hidden lg:table-cell">კომენტარი</TableHead>
              <TableHead className="h-10 w-12 text-right">
                <span className="sr-only">მოქმედებები</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {day.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  ამ დღეს ჯავშნები არ არის
                </TableCell>
              </TableRow>
            )}
            {day.rows.map((r) => (
              <TableRow key={r.id} className={cn(r.status === "cancelled" && "text-muted-foreground")}>
                <TableCell className="font-medium tabular-nums">
                  {r.start}–{r.end}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{r.patient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{r.patient.personalId}</span>
                    {r.patient.phone && <> · {r.patient.phone}</>}
                  </p>
                  {/* მობილურზე ექიმის სვეტი დამალულია */}
                  <p className="text-xs text-muted-foreground md:hidden">{r.doctor.name}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <p>{r.doctor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.doctor.specialty}
                    {r.doctor.room && ` · კაბ. ${r.doctor.room}`}
                  </p>
                </TableCell>
                <TableCell>
                  <AppointmentStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="hidden max-w-xs whitespace-normal lg:table-cell">
                  {r.status === "cancelled" && r.cancelReason ? (
                    <p className="text-xs">
                      <b>გაუქმების მიზეზი:</b> {r.cancelReason}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{r.comment ?? "—"}</p>
                  )}
                  {r.createdBy && <p className="text-xs text-muted-foreground/70">დაჯავშნა: {r.createdBy}</p>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {routes.finance && r.invoice && canViewInvoice && (
                      <Link
                        href={invoiceUrl(routes.finance, r.invoice.id)}
                        className="font-mono text-xs whitespace-nowrap text-primary hover:underline"
                        title="ინვოისი"
                      >
                        {r.invoice.number}
                      </Link>
                    )}
                    {routes.finance && !r.invoice && canInvoice && r.status !== "cancelled" && (
                      <Link
                        href={newInvoiceUrl(routes.finance, { appointmentId: r.id })}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                        title="ინვოისის შექმნა (ექიმის კონსულტაცია ავტომატურად)"
                      >
                        <FilePlus2 />
                        ინვოისი
                      </Link>
                    )}
                    <AppointmentRowActions row={r} today={today} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {day.pageCount > 1 && (
        <nav aria-label="გვერდები" className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>
            გვერდი {day.page} / {day.pageCount}
          </span>
          <PageLink href={day.page > 1 ? pageHref(day.page - 1) : null} label="წინა გვერდი">
            <ChevronLeft />
          </PageLink>
          <PageLink href={day.page < day.pageCount ? pageHref(day.page + 1) : null} label="შემდეგი გვერდი">
            <ChevronRight />
          </PageLink>
        </nav>
      )}
    </section>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const className = buttonVariants({ variant: "outline", size: "icon" });
  if (!href) {
    return (
      <span aria-disabled className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className} scroll={false}>
      {children}
    </Link>
  );
}
