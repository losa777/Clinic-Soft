import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { CashScreen } from "@/modules/finance/screens/report-screens";

export const instant = false;

export const metadata: Metadata = { title: "სალარო" };

export default async function AdminCashPage() {
  const user = await requirePermission("cash.shift");
  return <CashScreen user={user} />;
}
