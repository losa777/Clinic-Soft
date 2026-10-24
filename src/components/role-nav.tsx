"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  BriefcaseMedical,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  HandCoins,
  ListChecks,
  MessagesSquare,
  type LucideIcon,
  Package,
  PackageMinus,
  PackagePlus,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldPlus,
  Stethoscope,
  Syringe,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useActiveTabIntoView } from "@/components/use-active-tab";
import { cn } from "@/lib/utils";

/** ხატულები სახელით — სერვერული layout-იდან კომპონენტი (ფუნქცია) კლიენტს ვერ გადაეცემა. */
export const NAV_ICONS = {
  reports: BarChart3,
  invoices: FileText,
  debts: HandCoins,
  schedule: CalendarDays,
  booking: CalendarPlus,
  patients: Users,
  lab: FlaskConical,
  procedures: Syringe,
  cash: Wallet,
  stock: Package,
  receive: PackagePlus,
  issue: PackageMinus,
  movements: ArrowLeftRight,
  catalog: BookOpen,
  count: ClipboardCheck,
  norms: ListChecks,
  analytics: TrendingUp,
  audit: ScrollText,
  services: ClipboardList,
  doctors: Stethoscope,
  specialties: BriefcaseMedical,
  insurance: ShieldPlus,
  settings: Settings,
  users: Users,
  roles: ShieldCheck,
  chat: MessagesSquare,
} satisfies Record<string, LucideIcon>;

export type RoleNavLink = { href: string; label: string; icon: keyof typeof NAV_ICONS };

/**
 * როლის გვერდის ჩანართები; პირველი ბმული (როლის მთავარი გვერდი) აქტიურია მხოლოდ ზუსტ მისამართზე
 * (firstExact={false} — პირველიც ქვე-მისამართებზე, მაგ. /admin/invoices/5).
 */
export function RoleNav({ links, firstExact = true }: { links: RoleNavLink[]; firstExact?: boolean }) {
  const pathname = usePathname();
  const navRef = useActiveTabIntoView<HTMLElement>(pathname);
  return (
    <nav ref={navRef} className="tab-scroll -mx-4 border-b px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex gap-1">
        {links.map(({ href, label, icon }, i) => {
          const Icon = NAV_ICONS[icon];
          const active = i === 0 && firstExact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
