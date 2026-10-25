import type { Metadata } from "next";
import { requirePermission, requireRole } from "@/lib/dal";
import { ExportScreen } from "@/modules/reporting/screens";

export const instant = false;

export const metadata: Metadata = { title: "Excel ექსპორტი" };

export default async function ReportingExportPage({ searchParams }: PageProps<"/reporting/export">) {
  await requireRole("reporting");
  const user = await requirePermission("reporting.view", "reporting.export");
  return <ExportScreen user={user} params={await searchParams} />;
}
