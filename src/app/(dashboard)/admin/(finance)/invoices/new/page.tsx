import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { NewInvoiceScreen } from "@/modules/finance/screens/invoice-screens";

export const instant = false;

export const metadata: Metadata = { title: "ახალი ინვოისი" };

export default async function AdminNewInvoicePage({ searchParams }: PageProps<"/admin/invoices/new">) {
  await requirePermission("invoices.create");
  return <NewInvoiceScreen routes={FINANCE_ROUTES.admin} params={await searchParams} />;
}
