import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { IssueScreen } from "@/modules/issues/screens";

export const instant = false;

export const metadata: Metadata = { title: "პრობლემა" };

export default async function IssuePage({ params }: PageProps<"/issues/[id]">) {
  const user = await requireUser();
  return <IssueScreen user={user} rawId={(await params).id} />;
}
