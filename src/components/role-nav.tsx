"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, HandCoins, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** ხატულები სახელით — სერვერული layout-იდან კომპონენტი (ფუნქცია) კლიენტს ვერ გადაეცემა. */
const ICONS = { reports: BarChart3, invoices: FileText, debts: HandCoins } satisfies Record<string, LucideIcon>;

export type RoleNavLink = { href: string; label: string; icon: keyof typeof ICONS };

/** როლის გვერდის ჩანართები; პირველი ბმული (როლის მთავარი გვერდი) აქტიურია მხოლოდ ზუსტ მისამართზე. */
export function RoleNav({ links }: { links: RoleNavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex gap-1">
        {links.map(({ href, label, icon }, i) => {
          const Icon = ICONS[icon];
          const active = i === 0 ? pathname === href : pathname.startsWith(href);
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
