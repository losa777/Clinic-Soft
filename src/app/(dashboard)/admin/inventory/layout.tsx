import { RoleNav } from "@/components/role-nav";
import { INVENTORY_LINKS } from "../admin-groups";

/** ადმინის საწყობი: იგივე ეკრანები, რაც საწყობის მენეჯერთან (ადმინს ყველა უფლება აქვს). როლი — admin/layout.tsx. */
export default function AdminInventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={INVENTORY_LINKS} />
      {children}
    </div>
  );
}
