import { RoleNav } from "@/components/role-nav";
import { SYSTEM_LINKS } from "../admin-groups";

/** ადმინი → „სისტემა“: წვდომა და მონიტორინგი (URL-ები უცვლელია — (system) მხოლოდ დაჯგუფებაა). როლი — admin/layout.tsx. */
export default function AdminSystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav links={SYSTEM_LINKS} firstExact={false} />
      {children}
    </div>
  );
}
