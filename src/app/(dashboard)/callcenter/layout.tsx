import { requireRole } from "@/lib/dal";

export const instant = false;

/** ქოლ ცენტრი: მხოლოდ ვიზიტის დაჯავშნა (ერთი გვერდი, მენიუს გარეშე). */
export default async function CallCenterLayout({ children }: { children: React.ReactNode }) {
  await requireRole("callcenter");
  return <div className="flex flex-1 flex-col">{children}</div>;
}
