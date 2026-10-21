import { requireRole } from "@/lib/dal";
import { RegistrarNav } from "./registrar-nav";

export const instant = false;

export default async function RegistrarLayout({ children }: { children: React.ReactNode }) {
  await requireRole("registrar");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <RegistrarNav />
      {children}
    </div>
  );
}
