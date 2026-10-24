import { RoleNav } from "@/components/role-nav";
import { CLINIC_LINKS } from "../admin-groups";

/** ადმინი → „კლინიკა“: ცნობარები და პარამეტრები (URL-ები უცვლელია — (clinic) მხოლოდ დაჯგუფებაა). როლი — admin/layout.tsx. */
export default function AdminClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={CLINIC_LINKS} firstExact={false} />
      {children}
    </div>
  );
}
