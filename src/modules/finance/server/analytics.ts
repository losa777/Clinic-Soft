import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { addDays, OFFSET_MINUTES } from "@/lib/appointment-slots";
import { bucketKeys, type Grouping, groupingFor } from "@/modules/finance/analytics-format";
import { prisma } from "@/lib/db";
import { fromTetri, type Tetri } from "@/modules/finance/calc";
import { MEDICAL_CATEGORIES } from "@/modules/inventory/labels";
import { int, periodRange, tetri } from "./db";

/**
 * ფინანსური ანალიზი პერიოდზე (დირექტორი, ბუღალტერი — reports.finance). ყველა ჯამი SQL-ში (GROUP BY).
 * დარიცხული — ინვოისები შექმნის თარიღით (გაუქმებულის გარეშე), როგორც დღის ანგარიშში; მიღებული — გადახდები
 * მინუს დაბრუნებები გადახდის თარიღით. შედარება — იმავე ხანგრძლივობის წინა პერიოდთან.
 */

export type Totals = {
  billed: string;
  discount: string;
  insurance: string;
  patient: string;
  invoices: number;
  patients: number;
  /** საშუალო ინვოისი */
  average: string;
  collected: string;
  cash: string;
  card: string;
  refunds: string;
  /**
   * საწყობი (შესყიდვის ფასით; null — უფლების გარეშე): materials — სამედიცინო მასალის ხარჯი,
   * supplies — სამეურნეო/საკანცელარიო გაცემა, writeoffs — ჩამოწერის ზარალი (ორივე ჯგუფი)
   */
  materials: string | null;
  supplies: string | null;
  writeoffs: string | null;
};

export type TrendPoint = { key: string; billed: string; collected: string };
export type DoctorRow = { doctorId: number | null; name: string; invoices: number; patients: number; total: string; insurance: string; patient: string; average: string };
export type CategoryRow = { name: string; quantity: number; total: string };
export type ServiceRow = { serviceId: number | null; name: string; category: string | null; quantity: number; total: string };
export type InsurerRow = { companyId: number | null; name: string; invoices: number; insurance: string };

export type Analytics = {
  from: string;
  to: string;
  previous: { from: string; to: string };
  grouping: Grouping;
  current: Totals;
  prior: Totals;
  trend: TrendPoint[];
  doctors: DoctorRow[];
  categories: CategoryRow[];
  services: ServiceRow[];
  insurers: InsurerRow[];
};

/** UTC DATETIME → თბილისის თარიღი/თვე SQL-ში. */
const localKey = (column: Prisma.Sql, grouping: Grouping) =>
  Prisma.sql`DATE_FORMAT(DATE_ADD(${column}, INTERVAL ${OFFSET_MINUTES} MINUTE), ${grouping === "day" ? "%Y-%m-%d" : "%Y-%m"})`;

const money = (v: unknown) => fromTetri(tetri(v));
const avg = (total: Tetri, n: number) => fromTetri(n ? Math.round(total / n) : 0);

async function loadTotals(from: string, to: string, withInventory: boolean): Promise<Totals> {
  const r = periodRange(from, to);
  const [[inv], payments, [inventory]] = await Promise.all([
    prisma.$queryRaw<{ n: bigint; patients: bigint; total: unknown; discount: unknown; insurance: unknown; patient: unknown }[]>`
      SELECT COUNT(*) AS n, COUNT(DISTINCT i.patient_id) AS patients, SUM(i.total_amount) AS total,
             SUM(i.discount_amount) AS discount, SUM(i.insurance_amount) AS insurance, SUM(i.patient_amount) AS patient
      FROM invoices i
      WHERE i.created_at >= ${r.from} AND i.created_at < ${r.to} AND i.status <> 'cancelled'
    `,
    prisma.$queryRaw<{ type: string; method: string; total: unknown }[]>`
      SELECT p.type, p.method, SUM(p.amount) AS total
      FROM payments p
      WHERE p.created_at >= ${r.from} AND p.created_at < ${r.to}
      GROUP BY p.type, p.method
    `,
    withInventory
      ? prisma.$queryRaw<{ materials: unknown; supplies: unknown; writeoffs: unknown }[]>`
          SELECT SUM(CASE WHEN m.type = 'consumption' AND it.category IN (${Prisma.join(MEDICAL_CATEGORIES)}) THEN -m.quantity * COALESCE(b.unit_cost, 0) END) AS materials,
                 SUM(CASE WHEN m.type = 'consumption' AND it.category NOT IN (${Prisma.join(MEDICAL_CATEGORIES)}) THEN -m.quantity * COALESCE(b.unit_cost, 0) END) AS supplies,
                 SUM(CASE WHEN m.type = 'writeoff' THEN -m.quantity * COALESCE(b.unit_cost, 0) END) AS writeoffs
          FROM inventory_movements m JOIN inventory_batches b ON b.id = m.batch_id JOIN inventory_items it ON it.id = m.item_id
          WHERE m.created_at >= ${r.from} AND m.created_at < ${r.to} AND m.type IN ('consumption', 'writeoff')
        `
      : Promise.resolve([null]),
  ]);
  const sum = (type: string, method?: string) => payments.filter((p) => p.type === type && (!method || p.method === method)).reduce((s, p) => s + tetri(p.total), 0);
  const billed = tetri(inv?.total);
  const n = int(inv?.n);
  // რაოდენობა × ფასი — 4 ათწილადი; თეთრამდე მრგვალდება
  const cost = (v: unknown) => fromTetri(Math.round(Number(v ?? 0) * 100));
  return {
    billed: fromTetri(billed),
    discount: money(inv?.discount),
    insurance: money(inv?.insurance),
    patient: money(inv?.patient),
    invoices: n,
    patients: int(inv?.patients),
    average: avg(billed, n),
    collected: fromTetri(sum("payment") - sum("refund")),
    cash: fromTetri(sum("payment", "cash") - sum("refund", "cash")),
    card: fromTetri(sum("payment", "card") - sum("refund", "card")),
    refunds: fromTetri(sum("refund")),
    materials: inventory ? cost(inventory.materials) : null,
    supplies: inventory ? cost(inventory.supplies) : null,
    writeoffs: inventory ? cost(inventory.writeoffs) : null,
  };
}

async function loadTrend(from: string, to: string, grouping: Grouping): Promise<TrendPoint[]> {
  const r = periodRange(from, to);
  const [billed, collected] = await Promise.all([
    prisma.$queryRaw<{ k: string; total: unknown }[]>`
      SELECT ${localKey(Prisma.sql`i.created_at`, grouping)} AS k, SUM(i.total_amount) AS total
      FROM invoices i
      WHERE i.created_at >= ${r.from} AND i.created_at < ${r.to} AND i.status <> 'cancelled'
      GROUP BY k
    `,
    prisma.$queryRaw<{ k: string; total: unknown }[]>`
      SELECT ${localKey(Prisma.sql`p.created_at`, grouping)} AS k, SUM(IF(p.type = 'refund', -p.amount, p.amount)) AS total
      FROM payments p
      WHERE p.created_at >= ${r.from} AND p.created_at < ${r.to}
      GROUP BY k
    `,
  ]);
  const b = new Map(billed.map((x) => [x.k, money(x.total)]));
  const c = new Map(collected.map((x) => [x.k, money(x.total)]));
  return bucketKeys(from, to, grouping).map((key) => ({ key, billed: b.get(key) ?? "0.00", collected: c.get(key) ?? "0.00" }));
}

/** ინვოისების ფილტრი სხვა მოთხოვნებისთვის (ხაზები, ექიმები, დაზღვევა). */
const invoiceFilter = (from: Date, to: Date) => Prisma.sql`i.created_at >= ${from} AND i.created_at < ${to} AND i.status <> 'cancelled'`;

export async function loadDoctors(from: string, to: string): Promise<DoctorRow[]> {
  const r = periodRange(from, to);
  const rows = await prisma.$queryRaw<
    { doctor_id: number | null; first: string | null; last: string | null; snapshot: string | null; n: bigint; patients: bigint; total: unknown; insurance: unknown; patient: unknown }[]
  >`
    SELECT i.doctor_id, u.first_name AS first, u.last_name AS last, MAX(i.doctor_name) AS snapshot,
           COUNT(*) AS n, COUNT(DISTINCT i.patient_id) AS patients,
           SUM(i.total_amount) AS total, SUM(i.insurance_amount) AS insurance, SUM(i.patient_amount) AS patient
    FROM invoices i LEFT JOIN users u ON u.id = i.doctor_id
    WHERE ${invoiceFilter(r.from, r.to)}
    GROUP BY i.doctor_id, u.first_name, u.last_name
    ORDER BY total DESC
  `;
  return rows.map((d) => {
    const total = tetri(d.total);
    const n = int(d.n);
    return {
      doctorId: d.doctor_id === null ? null : int(d.doctor_id),
      name: d.first ? `${d.first} ${d.last ?? ""}`.trim() : (d.snapshot ?? "ექიმის გარეშე"),
      invoices: n,
      patients: int(d.patients),
      total: fromTetri(total),
      insurance: money(d.insurance),
      patient: money(d.patient),
      average: avg(total, n),
    };
  });
}

export async function loadServices(from: string, to: string, limit = 500): Promise<ServiceRow[]> {
  const r = periodRange(from, to);
  const rows = await prisma.$queryRaw<{ service_id: number | null; name: string; category: string | null; quantity: unknown; total: unknown }[]>`
    SELECT ii.service_id, ii.service_name AS name, MAX(c.name) AS category, SUM(ii.quantity) AS quantity, SUM(ii.total_amount) AS total
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    LEFT JOIN services s ON s.id = ii.service_id
    LEFT JOIN service_categories c ON c.id = s.category_id
    WHERE ${invoiceFilter(r.from, r.to)}
    GROUP BY ii.service_id, ii.service_name
    ORDER BY total DESC
    LIMIT ${limit}
  `;
  return rows.map((s) => ({ serviceId: s.service_id === null ? null : int(s.service_id), name: s.name, category: s.category, quantity: int(s.quantity), total: money(s.total) }));
}

async function loadCategories(from: string, to: string): Promise<CategoryRow[]> {
  const r = periodRange(from, to);
  const rows = await prisma.$queryRaw<{ name: string | null; quantity: unknown; total: unknown }[]>`
    SELECT c.name, SUM(ii.quantity) AS quantity, SUM(ii.total_amount) AS total
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    LEFT JOIN services s ON s.id = ii.service_id
    LEFT JOIN service_categories c ON c.id = s.category_id
    WHERE ${invoiceFilter(r.from, r.to)}
    GROUP BY c.id, c.name
    ORDER BY total DESC
  `;
  return rows.map((c) => ({ name: c.name ?? "კატეგორიის გარეშე", quantity: int(c.quantity), total: money(c.total) }));
}

async function loadInsurers(from: string, to: string): Promise<InsurerRow[]> {
  const r = periodRange(from, to);
  const rows = await prisma.$queryRaw<{ company_id: number | null; name: string | null; n: bigint; insurance: unknown }[]>`
    SELECT i.insurance_company_id AS company_id, ic.name, COUNT(*) AS n, SUM(i.insurance_amount) AS insurance
    FROM invoices i LEFT JOIN insurance_companies ic ON ic.id = i.insurance_company_id
    WHERE ${invoiceFilter(r.from, r.to)}
    GROUP BY i.insurance_company_id, ic.name
    ORDER BY insurance DESC
  `;
  return rows.map((x) => ({
    companyId: x.company_id === null ? null : int(x.company_id),
    name: x.company_id === null ? "დაზღვევის გარეშე" : (x.name ?? "—"),
    invoices: int(x.n),
    insurance: money(x.insurance),
  }));
}

export async function loadAnalytics(from: string, to: string, opts: { withInventory: boolean }): Promise<Analytics> {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const previous = { from: addDays(from, -days), to: addDays(from, -1) };
  const grouping = groupingFor(from, to);
  const [current, prior, trend, doctors, categories, services, insurers] = await Promise.all([
    loadTotals(from, to, opts.withInventory),
    loadTotals(previous.from, previous.to, opts.withInventory),
    loadTrend(from, to, grouping),
    loadDoctors(from, to),
    loadCategories(from, to),
    loadServices(from, to, 15),
    loadInsurers(from, to),
  ]);
  return { from, to, previous, grouping, current, prior, trend, doctors, categories, services, insurers };
}
