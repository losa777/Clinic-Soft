import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { ItemScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "დასახელება" };

export default async function LabInventoryItemPage({ params }: PageProps<"/lab/inventory/items/[id]">) {
  const user = await requirePermission("inventory.view");
  return <ItemScreen routes={INVENTORY_ROUTES.lab} user={user} rawId={(await params).id} />;
}
