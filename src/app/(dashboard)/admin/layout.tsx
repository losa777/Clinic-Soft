import { requireRole } from "@/lib/dal";
import { AdminNav } from "./admin-nav";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <AdminNav />
      {children}
    </div>
  );
}
