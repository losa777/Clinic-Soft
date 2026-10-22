import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import { BookingScreen } from "@/components/appointments/screens/booking-screen";
import { APPOINTMENT_ROUTES } from "@/lib/appointment-routes";
import { param, positiveInt, type SearchParams } from "@/modules/finance/params";
import { loadBookingPatient, loadDoctorProfile } from "@/modules/emr/server/schedule";

type User = Session["user"];

/** ბარათიდან დაჯავშნის ბმული: kind=followup — იმავე ექიმთან, referral — სხვა სპეციალისტთან. */
export function doctorBookingHref(patientId: number, kind: "followup" | "referral") {
  return `${APPOINTMENT_ROUTES.doctor.booking}?patient=${patientId}&kind=${kind}`;
}

/**
 * ექიმის დაჯავშნა იმავე ჯავშნის მოდულით (BookingWizard): განმეორებითი ვიზიტი — საკუთარ თავთან,
 * მიმართვა — სპეციალობისა და ექიმის არჩევით. კომენტარში ავტომატურად იწერება, ვინ დანიშნა.
 */
export async function DoctorBookingScreen({ user, params }: { user: User; params: SearchParams }) {
  const patientId = positiveInt(params.patient);
  const kind = param(params.kind);
  const [patient, profile] = await Promise.all([
    patientId ? loadBookingPatient(patientId) : Promise.resolve(null),
    loadDoctorProfile(Number(user.id)),
  ]);
  if (patientId && !patient) notFound();
  const by = `ექ. ${user.firstName} ${user.lastName}`;
  const initial = { patient: patient ?? undefined };

  if (kind === "followup") {
    return (
      <BookingScreen
        routes={APPOINTMENT_ROUTES.doctor}
        title="განმეორებითი ვიზიტი"
        description="აირჩიეთ თარიღი და თავისუფალი დრო"
        initial={{ ...initial, doctorId: profile?.id, comment: `განმეორებითი ვიზიტი (${by})` }}
      />
    );
  }
  if (kind === "referral") {
    return (
      <BookingScreen
        routes={APPOINTMENT_ROUTES.doctor}
        title="მიმართვა სპეციალისტთან"
        description="აირჩიეთ სპეციალობა, ექიმი და თავისუფალი დრო"
        initial={{ ...initial, comment: `მიმართვა: ${by}` }}
      />
    );
  }
  return <BookingScreen routes={APPOINTMENT_ROUTES.doctor} initial={initial} />;
}
