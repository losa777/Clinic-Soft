import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { NURSE_HOME } from "@/modules/emr/screens/queue-screens";

export const instant = false;

/** ექთნის გვერდი: ექიმის მიერ დანიშნული პროცედურების რიგი. */
export default async function NurseLayout({ children }: { children: React.ReactNode }) {
  await requireRole("nurse");
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={[{ href: NURSE_HOME, label: "პროცედურები", icon: "procedures" }]} />
      {children}
    </div>
  );
}
