import { RoleNav } from "@/components/role-nav";
import { APPOINTMENT_ROUTES } from "@/lib/appointment-routes";
import { requireRole } from "@/lib/dal";
import { DOCTOR_HOME, DOCTOR_PATIENTS } from "@/modules/emr/screens/doctor-screens";

export const instant = false;

/** ექიმის გვერდი: დღის განრიგი და პაციენტის ბარათი, პაციენტის ძიება. */
export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  await requireRole("doctor");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        links={[
          { href: DOCTOR_HOME, label: "დღის განრიგი", icon: "schedule" },
          { href: DOCTOR_PATIENTS, label: "პაციენტები", icon: "patients" },
          { href: APPOINTMENT_ROUTES.doctor.booking, label: "დაჯავშნა", icon: "booking" },
        ]}
      />
      {children}
    </div>
  );
}
