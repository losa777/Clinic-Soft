import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { ReceiptsScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "ზედნადებები" };

export default async function AdminInventoryReceiptsPage({ searchParams }: PageProps<"/admin/inventory/receipts">) {
  const user = await requirePermission("inventory.reports");
  return <ReceiptsScreen routes={INVENTORY_ROUTES.admin} user={user} params={await searchParams} />;
}
