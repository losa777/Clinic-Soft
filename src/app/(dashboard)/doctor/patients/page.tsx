import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { DoctorPatientSearchScreen } from "@/modules/emr/screens/doctor-screens";

export const instant = false;

export const metadata: Metadata = { title: "პაციენტები" };

export default async function DoctorPatientsPage({ searchParams }: PageProps<"/doctor/patients">) {
  await requirePermission("emr.view");
  return <DoctorPatientSearchScreen params={await searchParams} />;
}
