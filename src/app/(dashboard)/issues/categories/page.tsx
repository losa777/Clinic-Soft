import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { IssueCategoriesScreen } from "@/modules/issues/screens";

export const instant = false;

export const metadata: Metadata = { title: "პრობლემების კატეგორიები" };

export default async function IssueCategoriesPage() {
  await requirePermission("issues.manage");
  return <IssueCategoriesScreen />;
}
