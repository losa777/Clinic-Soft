import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { IssuesScreen } from "@/modules/issues/screens";

export const instant = false;

export const metadata: Metadata = { title: "პრობლემები" };

/** ადმინი: ყველა ბილეთი (issues.manage) — იგივე სია, რაც /issues-ზე, ადმინის მენიუში. */
export default async function AdminIssuesPage({ searchParams }: PageProps<"/admin/issues">) {
  const user = await requireRole("admin");
  return <IssuesScreen user={user} searchParams={await searchParams} defaultView="all" base="/admin/issues" />;
}
