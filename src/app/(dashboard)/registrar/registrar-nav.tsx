"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/registrar", label: "პაციენტის ძებნა", icon: Search },
  { href: "/registrar/new", label: "ახალი პაციენტი", icon: UserPlus },
];

export function RegistrarNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          // პაციენტის გვერდი (/registrar/patients/…) ძებნის ჩანართს ეკუთვნის
          const active = href === "/registrar" ? !pathname.startsWith("/registrar/new") : pathname.startsWith(href);
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
