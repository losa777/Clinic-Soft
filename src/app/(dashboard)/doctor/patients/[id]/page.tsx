import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { DoctorPatientScreen } from "@/modules/emr/screens/doctor-screens";

export const instant = false;

export const metadata: Metadata = { title: "პაციენტის ბარათი" };

export default async function DoctorPatientPage({ params, searchParams }: PageProps<"/doctor/patients/[id]">) {
  const user = await requirePermission("emr.view");
  return <DoctorPatientScreen user={user} rawId={(await params).id} params={await searchParams} />;
}
