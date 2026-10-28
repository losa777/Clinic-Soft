import type { Metadata } from "next";
import { FirstVisitsScreen } from "@/components/appointments/screens/first-visits-screen";
import { requirePermission, requireRole } from "@/lib/dal";

export const instant = false;

export const metadata: Metadata = { title: "პირველადი პაციენტები" };

export default async function RegistrarFirstVisitsPage({ searchParams }: PageProps<"/registrar/first-visits">) {
  await requireRole("registrar");
  await requirePermission("appointments.book");
  return <FirstVisitsScreen path="/registrar/first-visits" rawDate={(await searchParams).date} />;
}
