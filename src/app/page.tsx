import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { rolePath } from "@/lib/roles";

// სესიის მიხედვით გადამისამართება — სერვერზე იბლოკება, სტატიკური ნაწილი არ აქვს
export const instant = false;

export default async function Home() {
  const session = await getSession();
  redirect(session?.user ? rolePath(session.user.roleCode) : "/login");
}
