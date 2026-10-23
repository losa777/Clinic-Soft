import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { ChatPageScreen } from "@/modules/chat/screens/chat-page";

// layout-ის ავტორიზაცია ისედაც ბლოკავს მარშრუტს — streaming აქ არაფერს გვაძლევს
export const instant = false;

export const metadata: Metadata = { title: "ჩატი" };

/** შიდა ჩატი — ყველა როლისთვის (route-access.ts: SHARED_SECTIONS). */
export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  await requireUser();
  const c = Number((await searchParams).c);
  return <ChatPageScreen initialConversationId={Number.isSafeInteger(c) && c > 0 ? c : null} />;
}
