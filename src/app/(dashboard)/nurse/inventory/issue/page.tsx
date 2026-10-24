import type { Metadata } from "next";
import { requireAnyPermission } from "@/lib/dal";
import { IssueScreen } from "@/modules/inventory/screens";

export const instant = false;

export const metadata: Metadata = { title: "გახარჯვა" };

export default async function NurseInventoryIssuePage({ searchParams }: PageProps<"/nurse/inventory/issue">) {
  const user = await requireAnyPermission("inventory.consume", "inventory.manage");
  return <IssueScreen user={user} params={await searchParams} />;
}
