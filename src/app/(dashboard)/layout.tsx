import { Header } from "@/components/header";
import { requireUser } from "@/lib/dal";

// დაცვა უნდა დასრულდეს სანამ გვერდის რაიმე ნაწილი გაიგზავნება
export const instant = false;

/** ყველა როლის გვერდის საერთო ჩარჩო: ზედა პანელი + შიგთავსი. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <Header user={user} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
