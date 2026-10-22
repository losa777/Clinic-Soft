import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { ReceiptScreen } from "@/modules/finance/screens/report-screens";

export const instant = false;

export const metadata: Metadata = { title: "ქვითარი" };

export default async function RegistrarReceiptsDetailPage({ params }: PageProps<"/registrar/receipts/[id]">) {
  await requirePermission("payments.create");
  return <ReceiptScreen routes={FINANCE_ROUTES.registrar} rawId={(await params).id} />;
}
