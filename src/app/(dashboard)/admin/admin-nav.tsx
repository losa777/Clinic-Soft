"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseMedical,
  ClipboardList,
  Contact,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  ShieldPlus,
  Stethoscope,
  Users,
} from "lucide-react";
import { useActiveTabIntoView } from "@/components/use-active-tab";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: typeof Users; also?: string[] }[] = [
  { href: "/admin", label: "მიმოხილვა", icon: LayoutDashboard },
  { href: "/admin/users", label: "მომხმარებლები", icon: Users },
  { href: "/admin/roles", label: "როლები", icon: ShieldCheck },
  { href: "/admin/patients", label: "პაციენტები", icon: Contact },
  // ფინანსები: ინვოისები, სალარო, დავალიანებები, ანგარიშები, ქვითრები (ქვე-ჩანართები — admin/(finance)/layout.tsx)
  { href: "/admin/invoices", label: "ფინანსები", icon: FileText, also: ["/admin/cash", "/admin/debts", "/admin/reports", "/admin/receipts"] },
  { href: "/admin/services", label: "სერვისები", icon: ClipboardList },
  { href: "/admin/doctors", label: "ექიმები", icon: Stethoscope },
  { href: "/admin/specialties", label: "სპეციალობები", icon: BriefcaseMedical },
  { href: "/admin/insurance", label: "დაზღვევა", icon: ShieldPlus },
  { href: "/admin/settings", label: "რეკვიზიტები", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  const navRef = useActiveTabIntoView<HTMLElement>(pathname);

  return (
    <nav ref={navRef} className="tab-scroll -mx-4 border-b px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex gap-1">
        {LINKS.map(({ href, label, icon: Icon, also = [] }) => {
          const active = href === "/admin" ? pathname === href : [href, ...also].some((h) => pathname.startsWith(h));
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
