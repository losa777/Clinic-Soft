import { requireRole } from "@/lib/dal";

export const instant = false;

/** სერვერული დაცვა (proxy.ts-ის გარდა): მხოლოდ საკუთარი როლის გვერდი. */
export default async function RoleLayout({ children, params }: LayoutProps<"/[role]">) {
  const { role } = await params;
  await requireRole(role);
  return children;
}
