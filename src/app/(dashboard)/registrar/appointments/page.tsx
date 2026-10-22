import type { Metadata } from "next";
import { AppointmentsScreen } from "@/components/appointments/screens/appointments-screen";
import { APPOINTMENT_ROUTES } from "@/lib/appointment-routes";
import { requireRole } from "@/lib/dal";

export const instant = false;

export const metadata: Metadata = { title: "დღის ჯავშნები" };

export default async function RegistrarAppointmentsPage({ searchParams }: PageProps<"/registrar/appointments">) {
  await requireRole("registrar");
  return <AppointmentsScreen routes={APPOINTMENT_ROUTES.registrar} params={await searchParams} />;
}
