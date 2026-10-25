import type { Metadata } from "next";
import { requirePermission, requireRole } from "@/lib/dal";
import { ReportingPatientScreen } from "@/modules/reporting/screens";

export const instant = false;

export const metadata: Metadata = { title: "პაციენტის ჩანაწერი" };

export default async function ReportingPatientPage({ params, searchParams }: PageProps<"/reporting/patients/[id]">) {
  await requireRole("reporting");
  const user = await requirePermission("reporting.view");
  return <ReportingPatientScreen user={user} rawId={(await params).id} params={await searchParams} />;
}
