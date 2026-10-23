import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { DebtsScreen } from "@/modules/finance/screens/report-screens";

export const instant = false;

export const metadata: Metadata = { title: "დავალიანებები" };

export default async function AdminDebtsPage({ searchParams }: PageProps<"/admin/debts">) {
  await requirePermission("reports.debts");
  return <DebtsScreen routes={FINANCE_ROUTES.admin} params={await searchParams} />;
}
