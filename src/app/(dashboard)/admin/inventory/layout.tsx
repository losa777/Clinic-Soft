import { RoleNav } from "@/components/role-nav";
import { inventoryNav } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";

/** ადმინის საწყობი: იგივე ეკრანები, რაც საწყობის მენეჯერთან (ადმინს ყველა უფლება აქვს). როლი — admin/layout.tsx. */
export default function AdminInventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={inventoryNav(INVENTORY_ROUTES.admin)} />
      {children}
    </div>
  );
}
