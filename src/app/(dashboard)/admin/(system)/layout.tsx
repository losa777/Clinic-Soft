import { RoleNav } from "@/components/role-nav";

/** ადმინი → „სისტემა“: წვდომა და მონიტორინგი (URL-ები უცვლელია — (system) მხოლოდ დაჯგუფებაა). როლი — admin/layout.tsx. */
export default function AdminSystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleNav
        links={[
          { href: "/admin/users", label: "მომხმარებლები", icon: "users" },
          { href: "/admin/roles", label: "როლები", icon: "roles" },
          { href: "/admin/audit", label: "აუდიტი", icon: "audit" },
          { href: "/admin/chat", label: "ჩატი", icon: "chat" },
        ]}
        firstExact={false}
      />
      {children}
    </div>
  );
}
