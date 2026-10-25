import { requireRole } from "@/lib/dal";

export const instant = false;

/** IT სპეციალისტი: მთავარი გვერდი — მასზე მიწერილი პრობლემები (ტექნიკა, IT). */
export default async function ItLayout({ children }: { children: React.ReactNode }) {
  await requireRole("it");
  return children;
}
