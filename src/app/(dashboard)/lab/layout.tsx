import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { inventoryLink } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import { LAB_HOME } from "@/modules/emr/screens/queue-screens";

export const instant = false;

/** ლაბორანტის გვერდი: ლაბორატორიული და ინსტრუმენტული კვლევების რიგი. */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("lab");
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={[{ href: LAB_HOME, label: "კვლევები", icon: "lab" }, ...inventoryLink(user, INVENTORY_ROUTES.lab)]} />
      {children}
    </div>
  );
}
