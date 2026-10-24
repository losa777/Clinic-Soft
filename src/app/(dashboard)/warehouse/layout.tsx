import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { inventoryNav } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";

export const instant = false;

/** საწყობის მენეჯერი: ნაშთები, შემოსავალი, გახარჯვა/ჩამოწერა, მოძრაობები, ინვენტარიზაცია, ნორმები, კატალოგი. */
export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  await requireRole("warehouse");
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={inventoryNav(INVENTORY_ROUTES.warehouse)} />
      {children}
    </div>
  );
}
