import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { IssuesScreen } from "@/modules/issues/screens";

export const instant = false;

export const metadata: Metadata = { title: "პრობლემები" };

/** საწყობის მენეჯერი: მასზე მიწერილი ბილეთები (კატეგორია „მასალა / საწყობი“) და საკუთარი. */
export default async function WarehouseIssuesPage({ searchParams }: PageProps<"/warehouse/issues">) {
  const user = await requireRole("warehouse");
  return <IssuesScreen user={user} searchParams={await searchParams} defaultView="assigned" base="/warehouse/issues" />;
}
