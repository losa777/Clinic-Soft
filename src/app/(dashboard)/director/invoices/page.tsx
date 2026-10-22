import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { InvoicesScreen } from "@/modules/finance/screens/invoice-screens";

export const instant = false;

export const metadata: Metadata = { title: "ინვოისები" };

export default async function DirectorInvoicesPage({ searchParams }: PageProps<"/director/invoices">) {
  await requirePermission("invoices.view");
  return <InvoicesScreen routes={FINANCE_ROUTES.director} params={await searchParams} />;
}
