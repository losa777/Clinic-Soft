import { RoleNav } from "@/components/role-nav";

/** ადმინი → „კლინიკა“: ცნობარები და პარამეტრები (URL-ები უცვლელია — (clinic) მხოლოდ დაჯგუფებაა). როლი — admin/layout.tsx. */
export default function AdminClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        links={[
          { href: "/admin/services", label: "სერვისები", icon: "services" },
          { href: "/admin/doctors", label: "ექიმები", icon: "doctors" },
          { href: "/admin/specialties", label: "სპეციალობები", icon: "specialties" },
          { href: "/admin/insurance", label: "დაზღვევა", icon: "insurance" },
          { href: "/admin/settings", label: "რეკვიზიტები", icon: "settings" },
        ]}
        firstExact={false}
      />
      {children}
    </div>
  );
}
