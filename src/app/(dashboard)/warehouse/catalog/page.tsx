import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { CatalogScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "კატალოგი" };

export default async function WarehouseCatalogPage() {
  await requirePermission("inventory.manage");
  return <CatalogScreen />;
}
