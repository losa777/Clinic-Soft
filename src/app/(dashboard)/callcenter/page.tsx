import type { Metadata } from "next";
import { CallCenterBooking } from "@/components/appointments/call-center-booking";
import { loadBookingOptions } from "@/lib/appointment-records";
import { tbilisiToday } from "@/lib/appointment-slots";
import { requirePermission, requireRole } from "@/lib/dal";

export const instant = false;

export const metadata: Metadata = { title: "ვიზიტის დაჯავშნა" };

export default async function CallCenterPage() {
  await requireRole("callcenter");
  await requirePermission("appointments.book");
  const { specialties, doctors } = await loadBookingOptions();
  return <CallCenterBooking specialties={specialties} doctors={doctors} today={tbilisiToday()} />;
}
