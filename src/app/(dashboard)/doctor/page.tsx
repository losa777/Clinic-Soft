import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { DoctorHomeScreen } from "@/modules/emr/screens/doctor-screens";

export const instant = false;

export const metadata: Metadata = { title: "დღის განრიგი" };

export default async function DoctorHomePage({ searchParams }: PageProps<"/doctor">) {
  const user = await requirePermission("emr.view");
  return <DoctorHomeScreen user={user} params={await searchParams} />;
}
