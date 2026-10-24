import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { StockScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "ნაშთები" };

export default async function AdminInventoryStockPage({ searchParams }: PageProps<"/admin/inventory">) {
  const user = await requirePermission("inventory.view");
  return <StockScreen routes={INVENTORY_ROUTES.admin} user={user} params={await searchParams} />;
}
