import { RoleNav } from "@/components/role-nav";
import { requireRole } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { REPORTING_ROUTES } from "@/modules/reporting/screens";

export const instant = false;

/** ანგარიშგების სპეციალისტი: საოპერაციო შემთხვევები, პაციენტის ჩანაწერი (სანახავად), Excel ექსპორტი. */
export default async function ReportingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("reporting");
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        firstExact={false}
        links={[
          { href: REPORTING_ROUTES.cases, label: "საოპერაციო შემთხვევები", icon: "surgical" },
          ...(can(user, "reporting.export") ? [{ href: REPORTING_ROUTES.export, label: "Excel ექსპორტი", icon: "export" as const }] : []),
        ]}
      />
      {children}
    </div>
  );
}
