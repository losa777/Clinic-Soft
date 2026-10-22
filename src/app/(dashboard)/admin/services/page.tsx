import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { type CategoryRow, type ServiceRow, ServicesManager } from "@/modules/finance/components/admin/services-manager";
import { formatDateTime, fullName } from "@/modules/finance/server/db";

export const instant = false;

export const metadata: Metadata = { title: "სერვისები" };

export default async function ServicesPage() {
  const user = await requirePermission("services.view");
  const [services, categories] = await Promise.all([
    prisma.service.findMany({
      include: {
        category: { select: { name: true } },
        priceHistory: { orderBy: { changedAt: "desc" }, take: 5, include: { changedBy: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.serviceCategory.findMany({ include: { _count: { select: { services: true } } }, orderBy: { name: "asc" } }),
  ]);

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    categoryId: s.categoryId,
    category: s.category?.name ?? null,
    price: s.price.toFixed(2),
    isActive: s.isActive,
    history: s.priceHistory.map((h) => ({
      oldPrice: h.oldPrice.toFixed(2),
      newPrice: h.newPrice.toFixed(2),
      by: fullName(h.changedBy),
      at: formatDateTime(h.changedAt),
    })),
  }));
  const categoryRows: CategoryRow[] = categories.map((c) => ({ id: c.id, name: c.name, services: c._count.services }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">სერვისები</h1>
        <p className="text-sm text-muted-foreground">
          სერვისები და ფასები კატეგორიებით. სერვისი არ იშლება — ითიშება (ძველ ინვოისებში რჩება). ფასის ცვლილება ისტორიაში იწერება.
        </p>
      </div>
      <ServicesManager data={rows} categories={categoryRows} canManage={can(user, "services.manage")} />
    </section>
  );
}
