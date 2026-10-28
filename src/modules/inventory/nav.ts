import type { RoleNavLink } from "@/components/role-nav";
import { can } from "@/lib/permissions";
import type { InventoryRoutes } from "./routes";

/** საწყობის ჩანართები როლის მისამართებით (გვერდი, რომელიც როლს არ აქვს — არ ჩანს). */
export function inventoryNav(r: InventoryRoutes): RoleNavLink[] {
  const links: { href: string | null; label: string; icon: RoleNavLink["icon"] }[] = [
    { href: r.stock, label: "ნაშთები", icon: "stock" },
    { href: r.receive, label: "შემოსავალი", icon: "receive" },
    { href: r.issue, label: r.receive ? "გახარჯვა / ჩამოწერა" : "გახარჯვა", icon: "issue" },
    { href: r.movements, label: "მოძრაობები", icon: "movements" },
    { href: r.receipts, label: "ზედნადებები", icon: "invoices" },
    { href: r.count, label: "ინვენტარიზაცია", icon: "count" },
    { href: r.norms, label: "ნორმები", icon: "norms" },
    { href: r.catalog, label: "კატალოგი", icon: "catalog" },
  ];
  return links.filter((l): l is RoleNavLink => l.href !== null);
}

/** როლის მთავარ ჩანართებში „საწყობი“ — მხოლოდ inventory.view უფლებით. */
export function inventoryLink(user: { roleCode: string; permissions: string[] }, r: InventoryRoutes): RoleNavLink[] {
  return can(user, "inventory.view") ? [{ href: r.stock, label: "საწყობი", icon: "stock" }] : [];
}
