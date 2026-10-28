import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { ReceiptsScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "ზედნადებები" };

export default async function AccountantInventoryReceiptsPage({ searchParams }: PageProps<"/accountant/inventory/receipts">) {
  const user = await requirePermission("inventory.reports");
  return <ReceiptsScreen routes={INVENTORY_ROUTES.accountant} user={user} params={await searchParams} />;
}
