import type { Metadata } from "next";
import { RoleTitle } from "@/components/role-title";
import { requireRole } from "@/lib/dal";

// layout-ის ავტორიზაცია ისედაც ბლოკავს მარშრუტს — streaming აქ არაფერს გვაძლევს
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[role]">): Promise<Metadata> {
  const { role } = await params;
  const user = await requireRole(role);
  return { title: user.roleName };
}

export default async function RolePage({ params }: PageProps<"/[role]">) {
  const { role } = await params;
  const user = await requireRole(role);

  return (
    <div className="flex flex-1 flex-col">
      <RoleTitle>{user.roleName}</RoleTitle>
      {/* აქ დაემატება როლის ფუნქციონალი */}
    </div>
  );
}
