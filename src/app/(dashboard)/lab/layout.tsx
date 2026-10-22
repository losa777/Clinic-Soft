import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { LAB_HOME } from "@/modules/emr/screens/queue-screens";

export const instant = false;

/** ლაბორანტის გვერდი: ლაბორატორიული და ინსტრუმენტული კვლევების რიგი. */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  await requireRole("lab");
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={[{ href: LAB_HOME, label: "კვლევები", icon: "lab" }]} />
      {children}
    </div>
  );
}
