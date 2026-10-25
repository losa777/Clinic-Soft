import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { IssuesScreen } from "@/modules/issues/screens";

// layout-ის ავტორიზაცია ისედაც ბლოკავს მარშრუტს — streaming აქ არაფერს გვაძლევს
export const instant = false;

export const metadata: Metadata = { title: "პრობლემები" };

/** პრობლემების სია — ყველა როლისთვის (route-access.ts: SHARED_SECTIONS); რას ხედავს — modules/issues/server/access.ts. */
export default async function IssuesPage({ searchParams }: PageProps<"/issues">) {
  const user = await requireUser();
  return <IssuesScreen user={user} searchParams={await searchParams} />;
}
