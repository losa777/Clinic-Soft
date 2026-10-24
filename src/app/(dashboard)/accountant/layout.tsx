import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { inventoryLink } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { FINANCE_ROUTES } from "@/modules/finance/routes";

export const instant = false;

const routes = FINANCE_ROUTES.accountant;

/** ბუღალტერი: ფინანსების ნახვა და ანგარიშები (უფლებები — ადმინის „როლები“ → „უფლებები“). */
export default async function AccountantLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("accountant");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        links={[
          { href: routes.reports, label: "დღის ანგარიში", icon: "reports" },
          ...(can(user, "reports.finance") ? [{ href: routes.analytics, label: "ფინანსური ანალიზი", icon: "analytics" as const }] : []),
          { href: routes.invoices, label: "ინვოისები", icon: "invoices" },
          { href: routes.debts, label: "დავალიანებები", icon: "debts" },
          ...inventoryLink(user, INVENTORY_ROUTES.accountant),
        ]}
      />
      {children}
    </div>
  );
}
