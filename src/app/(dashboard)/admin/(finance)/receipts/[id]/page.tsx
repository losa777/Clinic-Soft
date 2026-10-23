import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { ReceiptScreen } from "@/modules/finance/screens/report-screens";

export const instant = false;

export const metadata: Metadata = { title: "ქვითარი" };

export default async function AdminReceiptPage({ params }: PageProps<"/admin/receipts/[id]">) {
  await requirePermission("payments.create");
  return <ReceiptScreen routes={FINANCE_ROUTES.admin} rawId={(await params).id} />;
}
