import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { IssuesScreen } from "@/modules/issues/screens";

export const instant = false;

export const metadata: Metadata = { title: "პრობლემები" };

/** დირექტორი: ყველა არაკონფიდენციალური ბილეთი (issues.view_all) და მასზე მიწერილი (მაგ. საჩივრები). */
export default async function DirectorIssuesPage({ searchParams }: PageProps<"/director/issues">) {
  const user = await requireRole("director");
  return <IssuesScreen user={user} searchParams={await searchParams} defaultView="all" base="/director/issues" />;
}
