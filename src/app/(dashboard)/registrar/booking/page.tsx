import type { Metadata } from "next";
import { BookingScreen } from "@/components/appointments/screens/booking-screen";
import { APPOINTMENT_ROUTES } from "@/lib/appointment-routes";
import { requireRole } from "@/lib/dal";

export const instant = false;

export const metadata: Metadata = { title: "ვიზიტის დაჯავშნა" };

export default async function RegistrarBookingPage() {
  await requireRole("registrar");
  return <BookingScreen routes={APPOINTMENT_ROUTES.registrar} />;
}
