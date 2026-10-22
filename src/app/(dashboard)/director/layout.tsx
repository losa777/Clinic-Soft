import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { FINANCE_ROUTES } from "@/modules/finance/routes";

export const instant = false;

const routes = FINANCE_ROUTES.director;

/** დირექტორი: ფინანსების ნახვა და ანგარიშები (უფლებები — ადმინის „როლები“ → „უფლებები“). */
export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  await requireRole("director");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        links={[
          { href: routes.reports, label: "დღის ანგარიში", icon: "reports" },
          { href: routes.invoices, label: "ინვოისები", icon: "invoices" },
          { href: routes.debts, label: "დავალიანებები", icon: "debts" },
        ]}
      />
      {children}
    </div>
  );
}
