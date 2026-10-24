"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Building2, ChevronDown, Contact, FileText, LayoutDashboard, Package, ShieldCheck } from "lucide-react";
import { NAV_ICONS, type RoleNavLink } from "@/components/role-nav";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActiveTabIntoView } from "@/components/use-active-tab";
import { cn } from "@/lib/utils";
import { CLINIC_LINKS, FINANCE_LINKS, INVENTORY_LINKS, SYSTEM_LINKS } from "./admin-groups";

/**
 * ადმინის მთავარი მენიუ — ჯგუფებად; ჯგუფის შიგნით ქვე-ჩანართები საკუთარ layout-შია (URL-ები დაჯგუფებით არ იცვლება):
 * ფინანსები — admin/(finance)/, საწყობი — admin/inventory/, კლინიკა — admin/(clinic)/, სისტემა — admin/(system)/.
 * items — ჯგუფის გვერდები (admin-groups.ts): ჩამოსაშლელი სია hover-ზე და ჩანართი მათზეც აქტიურია;
 * also — სხვა გვერდები, რომლებზეც ჯგუფი აქტიურია (მაგ. ქვითარი). firstExact — პირველი გვერდი მხოლოდ ზუსტ მისამართზე.
 */
type Group = { href: string; label: string; icon: typeof Contact; items?: RoleNavLink[]; also?: string[]; firstExact?: boolean };

const GROUPS: Group[] = [
  { href: "/admin", label: "მიმოხილვა", icon: LayoutDashboard },
  { href: "/admin/patients", label: "პაციენტები", icon: Contact },
  { href: "/admin/invoices", label: "ფინანსები", icon: FileText, items: FINANCE_LINKS, also: ["/admin/receipts"] },
  { href: "/admin/inventory", label: "საწყობი", icon: Package, items: INVENTORY_LINKS, firstExact: true },
  { href: "/admin/services", label: "კლინიკა", icon: Building2, items: CLINIC_LINKS },
  { href: "/admin/users", label: "სისტემა", icon: ShieldCheck, items: SYSTEM_LINKS },
];

const TAB_CLASS = "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors";
const tabClass = (active: boolean) =>
  cn(TAB_CLASS, active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground");

export function AdminNav() {
  const pathname = usePathname();
  const navRef = useActiveTabIntoView<HTMLElement>(pathname);

  return (
    <nav ref={navRef} className="tab-scroll -mx-4 border-b px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex gap-1">
        {GROUPS.map((group) => {
          const { href, label, icon: Icon, items = [], also = [] } = group;
          const active = href === "/admin" ? pathname === href : [href, ...items.map((i) => i.href), ...also].some((h) => pathname.startsWith(h));
          return (
            <li key={href}>
              {items.length ? (
                <GroupMenu group={group} active={active} pathname={pathname} />
              ) : (
                <Link href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                  <Icon className="size-4" />
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * ჯგუფი ჩამოსაშლელი სიით: hover-ზე (150 მწ, დახურვა — 300 მწ) ან ↓ ისრით იხსნება; ჯგუფზე დაჭერა — როგორც აქამდე,
 * ჯგუფის პირველ გვერდზე გადასვლა (ქვე-ჩანართები ქვემოთ ჩანს). სენსორულ ეკრანზე hover არ არის — მხოლოდ დაჭერა.
 */
function GroupMenu({ group, active, pathname }: { group: Group; active: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);
  const { href, label, icon: Icon, items = [], firstExact } = group;
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        // დაჭერა სიას არ ხსნის — ბმული გვერდზე გადადის
        if (next && details.reason === "trigger-press") return;
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger
        openOnHover
        delay={150}
        closeDelay={300}
        nativeButton={false}
        render={
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown") return;
              e.preventDefault();
              setOpen(true);
            }}
          />
        }
        className={tabClass(active)}
      >
        <Icon className="size-4" />
        {label}
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", open && "rotate-180")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-52">
        {items.map(({ href: itemHref, label: itemLabel, icon }, i) => {
          const ItemIcon = NAV_ICONS[icon];
          const current = i === 0 && firstExact ? pathname === itemHref : pathname.startsWith(itemHref);
          return (
            <MenuPrimitive.LinkItem
              key={itemHref}
              closeOnClick
              render={<Link href={itemHref} aria-current={current ? "page" : undefined} />}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
                current ? "font-medium text-primary" : "text-foreground",
              )}
            >
              <ItemIcon />
              {itemLabel}
            </MenuPrimitive.LinkItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
