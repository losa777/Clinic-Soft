import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { CountScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "ინვენტარიზაცია" };

export default async function WarehouseCountPage() {
  await requirePermission("inventory.manage");
  return <CountScreen />;
}
