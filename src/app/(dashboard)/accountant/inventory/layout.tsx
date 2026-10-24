import { RoleNav } from "@/components/role-nav";
import { inventoryNav } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";

/** ბუღალტერი: საწყობი (ჩანართები — უფლებების მიხედვით, src/modules/inventory/routes.ts). როლი — ზედა layout.tsx. */
export default function AccountantInventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={inventoryNav(INVENTORY_ROUTES.accountant)} />
      {children}
    </div>
  );
}
