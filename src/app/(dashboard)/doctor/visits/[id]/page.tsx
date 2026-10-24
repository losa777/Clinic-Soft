import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { DoctorVisitScreen } from "@/modules/emr/screens/doctor-screens";

export const instant = false;

export const metadata: Metadata = { title: "ვიზიტი" };

export default async function DoctorVisitPage({ params, searchParams }: PageProps<"/doctor/visits/[id]">) {
  const user = await requirePermission("emr.view");
  return <DoctorVisitScreen user={user} rawId={(await params).id} params={await searchParams} />;
}
