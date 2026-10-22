import Link from "next/link";
import { ListChecks } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { loadBookingOptions } from "@/lib/appointment-records";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { loadActiveCompanies } from "@/modules/finance/server/insurance";
import type { AppointmentRoutes } from "@/lib/appointment-routes";
import { tbilisiToday } from "@/lib/appointment-slots";
import { BookingWizard } from "../booking-wizard";

type WizardInitial = React.ComponentProps<typeof BookingWizard>["initial"];

/** ვიზიტის დაჯავშნის გვერდი (appointments.book უფლებით; უფლება გვერდზეც და ყოველ მოქმედებაშიც მოწმდება). */
export async function BookingScreen({
  routes,
  title = "ვიზიტის დაჯავშნა",
  description = "აირჩიეთ პაციენტი, ექიმი და თავისუფალი დრო",
  initial,
}: {
  routes: AppointmentRoutes;
  title?: string;
  description?: string;
  initial?: WizardInitial;
}) {
  const [{ specialties, doctors }, user] = await Promise.all([loadBookingOptions(), requireUser()]);
  // ახალი პაციენტის რეგისტრაციისას პოლისი — მხოლოდ უფლებით
  const insuranceCompanies =
    can(user, "invoices.create") || can(user, "insurance.manage") ? await loadActiveCompanies() : undefined;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Link href={routes.list} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <ListChecks />
          დღის ჯავშნები
        </Link>
      </div>
      <BookingWizard
        specialties={specialties}
        doctors={doctors}
        today={tbilisiToday()}
        routes={routes}
        insuranceCompanies={insuranceCompanies}
        initial={initial}
      />
    </section>
  );
}
