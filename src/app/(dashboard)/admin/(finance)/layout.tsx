import { RoleNav } from "@/components/role-nav";
import { FINANCE_ROUTES } from "@/modules/finance/routes";

const routes = FINANCE_ROUTES.admin;

/** ადმინის ფინანსები: იგივე ეკრანები, რაც რეგისტრატურაში (ადმინს ყველა უფლება აქვს). როლი — admin/layout.tsx. */
export default function AdminFinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        links={[
          { href: routes.invoices, label: "ინვოისები", icon: "invoices" },
          { href: routes.cash, label: "სალარო", icon: "cash" },
          { href: routes.debts, label: "დავალიანებები", icon: "debts" },
          { href: routes.reports, label: "დღის ანგარიში", icon: "reports" },
          { href: routes.analytics, label: "ფინანსური ანალიზი", icon: "analytics" },
        ]}
        firstExact={false}
      />
      {children}
    </div>
  );
}
