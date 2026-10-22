"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseMedical,
  ClipboardList,
  Contact,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  ShieldPlus,
  Stethoscope,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "მიმოხილვა", icon: LayoutDashboard },
  { href: "/admin/users", label: "მომხმარებლები", icon: Users },
  { href: "/admin/roles", label: "როლები", icon: ShieldCheck },
  { href: "/admin/patients", label: "პაციენტები", icon: Contact },
  { href: "/admin/services", label: "სერვისები", icon: ClipboardList },
  { href: "/admin/doctors", label: "ექიმები", icon: Stethoscope },
  { href: "/admin/specialties", label: "სპეციალობები", icon: BriefcaseMedical },
  { href: "/admin/insurance", label: "დაზღვევა", icon: ShieldPlus },
  { href: "/admin/settings", label: "რეკვიზიტები", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
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
