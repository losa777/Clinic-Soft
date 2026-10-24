import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { ReceiveScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "შემოსავალი" };

export default async function AdminInventoryReceivePage() {
  await requirePermission("inventory.receive");
  return <ReceiveScreen routes={INVENTORY_ROUTES.admin} />;
}
