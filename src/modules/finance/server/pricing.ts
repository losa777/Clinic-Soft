import "server-only";
import { type Coverage, resolveCoverage } from "@/modules/finance/calc";
import type { ActivePolicy, BillableService } from "@/modules/finance/types";
import { type Db, formatDay, todayAsDate } from "./db";

/**
 * ფასები და დაზღვევა ინვოისისთვის: პაციენტის აქტიური პოლისი, სადაზღვევო პირობები სერვისებზე, აქტიური სერვისები.
 * როლი/უფლება აქ არ მოწმდება — გამომძახებელი ამოწმებს.
 */

/** აქტიური პოლისი დღეს: is_active, კომპანია აქტიურია, valid_from ≤ დღეს ≤ valid_to. რამდენიმეა — უახლესი. */
export async function loadActivePolicy(db: Db, patientId: number): Promise<ActivePolicy | null> {
  const today = todayAsDate();
  const p = await db.patientInsurance.findFirst({
    where: { patientId, isActive: true, validFrom: { lte: today }, validTo: { gte: today }, company: { isActive: true } },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ validFrom: "desc" }, { id: "desc" }],
  });
  if (!p) return null;
  return {
    id: p.id,
    companyId: p.company.id,
    companyName: p.company.name,
    policyNumber: p.policyNumber,
    validTo: formatDay(p.validTo),
  };
}

/** კომპანიის პირობები მოცემულ სერვისებზე → სერვისი → დაფარვა (სერვისის პირობა უპირატესია კატეგორიისაზე). */
export async function loadCoverage(
  db: Db,
  companyId: number,
  services: { id: number; categoryId: number | null }[],
): Promise<Map<number, Coverage>> {
  const serviceIds = services.map((s) => s.id);
  const categoryIds = [...new Set(services.flatMap((s) => (s.categoryId == null ? [] : [s.categoryId])))];
  const contracts = await db.insuranceContract.findMany({
    where: { companyId, OR: [{ serviceId: { in: serviceIds } }, { categoryId: { in: categoryIds } }] },
  });
  const terms = contracts.map((c) => ({
    serviceId: c.serviceId,
    categoryId: c.categoryId,
    percent: c.coveragePercent.toFixed(2),
    limit: c.limitAmount?.toFixed(2) ?? null,
  }));
  const map = new Map<number, Coverage>();
  for (const s of services) {
    const coverage = resolveCoverage(terms, s);
    if (coverage) map.set(s.id, coverage);
  }
  return map;
}

/** აქტიური სერვისები ინვოისის ფორმისთვის (სია ასობითაა — ძებნა კლიენტზე). */
export async function loadBillableServices(db: Db): Promise<BillableService[]> {
  const services = await db.service.findMany({
    where: { isActive: true },
    include: { category: { select: { name: true } } },
    orderBy: [{ name: "asc" }],
  });
  return services.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    categoryId: s.categoryId,
    category: s.category?.name ?? null,
    price: s.price.toFixed(2),
  }));
}
