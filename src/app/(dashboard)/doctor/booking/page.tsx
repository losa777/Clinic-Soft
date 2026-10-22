import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { DoctorBookingScreen } from "@/modules/emr/screens/doctor-booking";

export const instant = false;

export const metadata: Metadata = { title: "ვიზიტის დაჯავშნა" };

export default async function DoctorBookingPage({ searchParams }: PageProps<"/doctor/booking">) {
  const user = await requirePermission("appointments.book");
  return <DoctorBookingScreen user={user} params={await searchParams} />;
}
