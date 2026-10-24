import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { MovementsScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "მოძრაობები" };

export default async function AdminInventoryMovementsPage({ searchParams }: PageProps<"/admin/inventory/movements">) {
  const user = await requirePermission("inventory.view");
  return <MovementsScreen routes={INVENTORY_ROUTES.admin} user={user} params={await searchParams} />;
}
