import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { InvoiceScreen } from "@/modules/finance/screens/invoice-screens";

export const instant = false;

export const metadata: Metadata = { title: "ინვოისი" };

export default async function DirectorInvoicePage({ params }: PageProps<"/director/invoices/[id]">) {
  const user = await requirePermission("invoices.view");
  return <InvoiceScreen routes={FINANCE_ROUTES.director} rawId={(await params).id} user={user} />;
}
