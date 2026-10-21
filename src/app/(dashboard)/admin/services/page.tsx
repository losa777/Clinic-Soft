import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatGel } from "@/lib/money";
import { type ServiceRow, ServicesTable } from "./services-table";

export const instant = false;

export const metadata: Metadata = { title: "სერვისები" };

export default async function ServicesPage() {
  await requireRole("admin");
  const services = await prisma.service.findMany({ orderBy: { name: "asc" } });

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    price: s.price.toFixed(2),
    priceLabel: formatGel(s.price.toFixed(2)),
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">სერვისები</h1>
        <p className="text-sm text-muted-foreground">კლინიკის სერვისები და მათი ფასები, რომლებიც პაციენტს შეუძლია მიიღოს</p>
      </div>
      <ServicesTable data={rows} />
    </section>
  );
}
