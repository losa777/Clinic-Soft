import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { IssuesScreen } from "@/modules/issues/screens";

export const instant = false;

export const metadata: Metadata = { title: "IT სპეციალისტი" };

export default async function ItPage({ searchParams }: PageProps<"/it">) {
  const user = await requireRole("it");
  return <IssuesScreen user={user} searchParams={await searchParams} defaultView="assigned" base="/it" />;
}
