"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Contact, FileText, LayoutDashboard, Package, ShieldCheck } from "lucide-react";
import { useActiveTabIntoView } from "@/components/use-active-tab";
import { cn } from "@/lib/utils";

/**
 * ადმინის მთავარი მენიუ — ჯგუფებად; ჯგუფის შიგნით ქვე-ჩანართები საკუთარ layout-შია (URL-ები დაჯგუფებით არ იცვლება):
 * ფინანსები — admin/(finance)/, საწყობი — admin/inventory/, კლინიკა — admin/(clinic)/, სისტემა — admin/(system)/.
 * also — ჯგუფის სხვა გვერდები (ჩანართი მათზეც აქტიურია).
 */
const LINKS: { href: string; label: string; icon: typeof Contact; also?: string[] }[] = [
  { href: "/admin", label: "მიმოხილვა", icon: LayoutDashboard },
  { href: "/admin/patients", label: "პაციენტები", icon: Contact },
  { href: "/admin/invoices", label: "ფინანსები", icon: FileText, also: ["/admin/cash", "/admin/debts", "/admin/reports", "/admin/receipts", "/admin/analytics"] },
  { href: "/admin/inventory", label: "საწყობი", icon: Package },
  // სერვისები, ექიმები, სპეციალობები, დაზღვევა, რეკვიზიტები
  { href: "/admin/services", label: "კლინიკა", icon: Building2, also: ["/admin/doctors", "/admin/specialties", "/admin/insurance", "/admin/settings"] },
  // მომხმარებლები, როლები, აუდიტი, ჩატი
  { href: "/admin/users", label: "სისტემა", icon: ShieldCheck, also: ["/admin/roles", "/admin/audit", "/admin/chat"] },
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
