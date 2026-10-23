import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { DoctorStatsScreen } from "@/modules/emr/screens/doctor-stats";

export const instant = false;

export const metadata: Metadata = { title: "სტატისტიკა" };

export default async function DoctorStatsPage({ searchParams }: PageProps<"/doctor/stats">) {
  const user = await requirePermission("emr.edit");
  return <DoctorStatsScreen user={user} params={await searchParams} />;
}
