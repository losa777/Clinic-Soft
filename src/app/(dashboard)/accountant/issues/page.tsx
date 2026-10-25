import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { IssuesScreen } from "@/modules/issues/screens";

export const instant = false;

export const metadata: Metadata = { title: "პრობლემები" };

/** ბუღალტერი: მასზე მიწერილი ბილეთები (კატეგორია „ფინანსები / დაზღვევა“) და საკუთარი. */
export default async function AccountantIssuesPage({ searchParams }: PageProps<"/accountant/issues">) {
  const user = await requireRole("accountant");
  return <IssuesScreen user={user} searchParams={await searchParams} defaultView="assigned" base="/accountant/issues" />;
}
