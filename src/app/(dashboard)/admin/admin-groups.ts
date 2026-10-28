import type { RoleNavLink } from "@/components/role-nav";
import { FINANCE_ROUTES } from "@/modules/finance/routes";
import { inventoryNav } from "@/modules/inventory/nav";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";

/**
 * ადმინის ჯგუფების გვერდები — ერთი სია ორივესთვის: ჯგუფის ქვე-ჩანართები (ჯგუფის layout) და მთავარი მენიუს
 * ჩამოსაშლელი სია hover-ზე (admin-nav.tsx). ჩვეულებრივი მოდული (არა "use client") — სერვერული layout-ებიც კითხულობენ.
 */
const finance = FINANCE_ROUTES.admin;

export const FINANCE_LINKS: RoleNavLink[] = [
  { href: finance.invoices, label: "ინვოისები", icon: "invoices" },
  ...(finance.cash ? [{ href: finance.cash, label: "სალარო", icon: "cash" } as const] : []),
  { href: finance.debts, label: "დავალიანებები", icon: "debts" },
  { href: finance.reports, label: "დღის ანგარიში", icon: "reports" },
  ...(finance.analytics ? [{ href: finance.analytics, label: "ფინანსური ანალიზი", icon: "analytics" } as const] : []),
];

export const INVENTORY_LINKS: RoleNavLink[] = inventoryNav(INVENTORY_ROUTES.admin);

export const CLINIC_LINKS: RoleNavLink[] = [
  { href: "/admin/services", label: "სერვისები", icon: "services" },
  { href: "/admin/doctors", label: "ექიმები", icon: "doctors" },
  { href: "/admin/specialties", label: "სპეციალობები", icon: "specialties" },
  { href: "/admin/insurance", label: "დაზღვევა", icon: "insurance" },
  { href: "/admin/banks", label: "ბანკები", icon: "banks" },
  { href: "/admin/settings", label: "რეკვიზიტები", icon: "settings" },
];

export const SYSTEM_LINKS: RoleNavLink[] = [
  { href: "/admin/users", label: "მომხმარებლები", icon: "users" },
  { href: "/admin/roles", label: "როლები", icon: "roles" },
  { href: "/admin/audit", label: "აუდიტი", icon: "audit" },
  { href: "/admin/chat", label: "ჩატი", icon: "chat" },
];
