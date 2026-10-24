import { RoleNav } from "@/components/role-nav";
import { FINANCE_LINKS } from "../admin-groups";

/** ადმინის ფინანსები: იგივე ეკრანები, რაც რეგისტრატურაში (ადმინს ყველა უფლება აქვს). როლი — admin/layout.tsx. */
export default function AdminFinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={FINANCE_LINKS} firstExact={false} />
      {children}
    </div>
  );
}
