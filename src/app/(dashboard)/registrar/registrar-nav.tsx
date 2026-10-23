"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarPlus, FileText, HandCoins, ListChecks, Search, UserPlus, Wallet } from "lucide-react";
import { APPOINTMENT_ROUTES } from "@/lib/appointment-routes";
import { useActiveTabIntoView } from "@/components/use-active-tab";
import { cn } from "@/lib/utils";
import { FINANCE_ROUTES } from "@/modules/finance/routes";

const finance = FINANCE_ROUTES.registrar;

const LINKS = [
  { href: "/registrar", label: "პაციენტის ძებნა", icon: Search },
  { href: "/registrar/new", label: "ახალი პაციენტი", icon: UserPlus },
  { href: APPOINTMENT_ROUTES.registrar.booking, label: "ვიზიტის დაჯავშნა", icon: CalendarPlus },
  { href: APPOINTMENT_ROUTES.registrar.list, label: "ჯავშნები", icon: ListChecks },
  { href: finance.invoices, label: "ინვოისები", icon: FileText },
  { href: finance.cash, label: "სალარო", icon: Wallet },
  { href: finance.debts, label: "დავალიანებები", icon: HandCoins },
  { href: finance.reports, label: "ანგარიშები", icon: BarChart3 },
];

export function RegistrarNav() {
  const pathname = usePathname();
  const navRef = useActiveTabIntoView<HTMLElement>(pathname);

  return (
    <nav ref={navRef} className="tab-scroll -mx-4 border-b px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          // პაციენტის გვერდი (/registrar/patients/…) ძებნის ჩანართს ეკუთვნის
          const active =
            href === "/registrar"
              ? !LINKS.some((l) => l.href !== href && pathname.startsWith(l.href))
              : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
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
