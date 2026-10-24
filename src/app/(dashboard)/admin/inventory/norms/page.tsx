import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { NormsScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "ნორმები" };

export default async function AdminInventoryNormsPage() {
  await requirePermission("inventory.manage");
  return <NormsScreen />;
}
