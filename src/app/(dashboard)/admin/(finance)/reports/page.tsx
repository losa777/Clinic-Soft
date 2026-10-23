import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { ReportsScreen } from "@/modules/finance/screens/report-screens";

export const instant = false;

export const metadata: Metadata = { title: "დღის ანგარიში" };

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requirePermission("reports.daily");
  return <ReportsScreen routes={FINANCE_ROUTES.admin} params={await searchParams} />;
}
