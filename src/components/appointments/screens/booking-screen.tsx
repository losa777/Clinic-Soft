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

/** ვიზიტის დაჯავშნის გვერდი (ნებისმიერი როლი APPOINTMENT_ROLES-დან; როლი გვერდზე მოწმდება). */
export async function BookingScreen({ routes }: { routes: AppointmentRoutes }) {
  const [{ specialties, doctors }, user] = await Promise.all([loadBookingOptions(), requireUser()]);
  // ახალი პაციენტის რეგისტრაციისას პოლისი — მხოლოდ უფლებით
  const insuranceCompanies =
    can(user, "invoices.create") || can(user, "insurance.manage") ? await loadActiveCompanies() : undefined;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">ვიზიტის დაჯავშნა</h1>
          <p className="text-sm text-muted-foreground">აირჩიეთ პაციენტი, ექიმი და თავისუფალი დრო</p>
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
      />
    </section>
  );
}
