import "server-only";
import { prisma } from "@/lib/db";
import { fromDecimal } from "@/modules/inventory/stock";
import type { Db } from "./db";

/**
 * სერვისების ნორმები (service_materials): რა მასალა იხარჯება ერთ შესრულებაზე. შესრულებისას ფორმაში წინასწარ ივსება,
 * შემსრულებელი რაოდენობას ასწორებს. გათიშული დასახელება ნორმიდან არ ჩანს.
 */

export type NormLine = { itemId: number; name: string; unit: string; quantity: number };

export async function loadNorms(serviceIds: number[]): Promise<Map<number, NormLine[]>> {
  const result = new Map<number, NormLine[]>();
  if (serviceIds.length === 0) return result;
  const rows = await prisma.serviceMaterial.findMany({
    where: { serviceId: { in: [...new Set(serviceIds)] }, item: { isActive: true } },
    include: { item: { select: { name: true, unit: true } } },
    orderBy: { item: { name: "asc" } },
  });
  for (const r of rows) {
    const list = result.get(r.serviceId) ?? [];
    list.push({ itemId: r.itemId, name: r.item.name, unit: r.item.unit, quantity: fromDecimal(r.quantity) });
    result.set(r.serviceId, list);
  }
  return result;
}

export type NormServiceRow = { id: number; name: string; category: string | null; orderType: string | null; lines: NormLine[] };

/** ნორმების გვერდი: აქტიური სერვისები ნორმებით (დანიშნულებად გამოყენებადი — პირველი). */
export async function loadNormServices(): Promise<NormServiceRow[]> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: { select: { name: true, orderType: true } } },
    orderBy: { name: "asc" },
  });
  const norms = await loadNorms(services.map((s) => s.id));
  return services
    .map((s) => ({ id: s.id, name: s.name, category: s.category?.name ?? null, orderType: s.category?.orderType ?? null, lines: norms.get(s.id) ?? [] }))
    .sort((a, b) => Number(b.orderType !== null) - Number(a.orderType !== null) || a.name.localeCompare(b.name, "ka"));
}

/** ნორმის ჩანაცვლება (ძველი ხაზები იშლება, ახალი იწერება). */
export async function replaceNorms(tx: Db, serviceId: number, lines: { itemId: number; quantity: string }[]) {
  await tx.serviceMaterial.deleteMany({ where: { serviceId } });
  if (lines.length) await tx.serviceMaterial.createMany({ data: lines.map((l) => ({ serviceId, itemId: l.itemId, quantity: l.quantity })) });
}
