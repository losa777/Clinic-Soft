import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { AnalyticsScreen } from "@/modules/finance/screens/report-screens";

export const instant = false;

export const metadata: Metadata = { title: "ფინანსური ანალიზი" };

export default async function AccountantAnalyticsPage({ searchParams }: PageProps<"/accountant/analytics">) {
  const user = await requirePermission("reports.finance");
  return <AnalyticsScreen routes={FINANCE_ROUTES.accountant} user={user} params={await searchParams} />;
}
