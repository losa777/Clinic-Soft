import { Header } from "@/components/header";
import { requireUser } from "@/lib/dal";
import { ChatProvider } from "@/modules/chat/client/provider";
import { CallPanel } from "@/modules/chat/components/call-panel";
import { ChatNotifications } from "@/modules/chat/screens/chat-notifications";
import { ChatPopup } from "@/modules/chat/screens/chat-popup";

// დაცვა უნდა დასრულდეს სანამ გვერდის რაიმე ნაწილი გაიგზავნება
export const instant = false;

/** ყველა როლის გვერდის საერთო ჩარჩო: ზედა პანელი + შიგთავსი. ჩატი — ერთი კავშირი ტაბზე, გვერდებს შორის არ წყდება. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <ChatProvider me={{ id: Number(user.id), firstName: user.firstName, lastName: user.lastName, avatar: user.avatar }}>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6">{children}</main>
      <ChatPopup />
      <ChatNotifications />
      <CallPanel />
    </ChatProvider>
  );
}
