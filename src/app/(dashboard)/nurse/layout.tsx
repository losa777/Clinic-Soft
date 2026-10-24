import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { inventoryLink } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { NURSE_HOME } from "@/modules/emr/screens/queue-screens";

export const instant = false;

/** ექთნის გვერდი: ექიმის მიერ დანიშნული პროცედურების რიგი. */
export default async function NurseLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("nurse");
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={[{ href: NURSE_HOME, label: "პროცედურები", icon: "procedures" }, ...inventoryLink(user, INVENTORY_ROUTES.nurse)]} />
      {children}
    </div>
  );
}
