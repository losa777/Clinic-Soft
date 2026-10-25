import type { Metadata } from "next";
import { requirePermission, requireRole } from "@/lib/dal";
import { CasesScreen } from "@/modules/reporting/screens";

export const instant = false;

export const metadata: Metadata = { title: "საოპერაციო შემთხვევები" };

export default async function ReportingPage({ searchParams }: PageProps<"/reporting">) {
  await requireRole("reporting");
  const user = await requirePermission("reporting.view");
  return <CasesScreen user={user} params={await searchParams} />;
}
