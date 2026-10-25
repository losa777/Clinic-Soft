import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { inventoryLink } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { FINANCE_ROUTES } from "@/modules/finance/routes";

export const instant = false;

const routes = FINANCE_ROUTES.director;

/** დირექტორი: ფინანსების ნახვა და ანგარიშები (უფლებები — ადმინის „როლები“ → „უფლებები“). */
export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("director");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        links={[
          { href: routes.reports, label: "დღის ანგარიში", icon: "reports" },
          ...(can(user, "reports.finance") ? [{ href: routes.analytics, label: "ფინანსური ანალიზი", icon: "analytics" as const }] : []),
          { href: routes.invoices, label: "ინვოისები", icon: "invoices" },
          { href: routes.debts, label: "დავალიანებები", icon: "debts" },
          ...inventoryLink(user, INVENTORY_ROUTES.director),
          ...(can(user, "audit.view") ? [{ href: "/director/audit", label: "აუდიტი", icon: "audit" as const }] : []),
          { href: "/director/issues", label: "პრობლემები", icon: "issues" },
        ]}
      />
      {children}
    </div>
  );
}
