import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { fromTetri, toTetri } from "@/modules/finance/calc";
import { type Db, formatDateTime, fullName, int, periodRange, tetri } from "./db";

/**
 * დავალიანებები — ყოველთვის მოთხოვნით ითვლება (ცალკე ველში არ ინახება):
 * პაციენტის ვალი = Σ(ღია ინვოისის პაციენტის წილი − ამ ინვოისზე წმინდა გადახდილი).
 * ღია ინვოისები status-ის ინდექსით, გადახდილი — payments(invoice_id) ინდექსით, ჯამი SQL-ში.
 */

/** ინვოისზე წმინდა გადახდილი (SQL ქვემოთხოვნა). */
const PAID_SQL = Prisma.sql`COALESCE((
  SELECT SUM(CASE WHEN p.type = 'payment' THEN p.amount ELSE -p.amount END) FROM payments p WHERE p.invoice_id = i.id
), 0)`;

/** პაციენტების ვალი (ძებნის შედეგებისთვის, პაციენტის ბარათისთვის). */
export async function patientDebts(db: Db, patientIds: number[]): Promise<Map<number, number>> {
  if (!patientIds.length) return new Map();
  const rows = await db.$queryRaw<{ patient_id: number; debt: unknown }[]>`
    SELECT i.patient_id, SUM(i.patient_amount - ${PAID_SQL}) AS debt
    FROM invoices i
    WHERE i.patient_id IN (${Prisma.join(patientIds)}) AND i.status IN ('unpaid', 'partial')
    GROUP BY i.patient_id
  `;
  return new Map(rows.map((r) => [int(r.patient_id), Math.max(0, tetri(r.debt))]));
}

export const DEBTS_PAGE_SIZE = 25;

export type DebtFilter = { from: string | null; to: string | null; minAmount: string; page: number };

export type DebtRow = {
  patientId: number;
  name: string;
  personalId: string;
  phone: string | null;
  invoices: number;
  debt: string;
  oldest: string;
};

function debtGroupSql(f: DebtFilter) {
  const range = f.from && f.to ? periodRange(f.from, f.to) : null;
  const min = toTetri(f.minAmount || "0");
  return Prisma.sql`
    SELECT i.patient_id, COUNT(*) AS invoices, SUM(i.patient_amount - ${PAID_SQL}) AS debt, MIN(i.created_at) AS oldest
    FROM invoices i
    WHERE i.status IN ('unpaid', 'partial')
      ${range ? Prisma.sql`AND i.created_at >= ${range.from} AND i.created_at < ${range.to}` : Prisma.empty}
    GROUP BY i.patient_id
    HAVING debt > 0 AND debt >= ${fromTetri(min)}
  `;
}

async function withPatients(rows: { patient_id: number; invoices: bigint; debt: unknown; oldest: Date }[]): Promise<DebtRow[]> {
  const patients = await prisma.patient.findMany({
    where: { id: { in: rows.map((r) => int(r.patient_id)) } },
    select: { id: true, firstName: true, lastName: true, personalId: true, phone: true },
  });
  const byId = new Map(patients.map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(int(r.patient_id));
    return {
      patientId: int(r.patient_id),
      name: fullName(p) ?? "—",
      personalId: p?.personalId ?? "",
      phone: p?.phone ?? null,
      invoices: int(r.invoices),
      debt: fromTetri(tetri(r.debt)),
      oldest: formatDateTime(r.oldest),
    };
  });
}

/** დავალიანებების სია: ფილტრი (ინვოისის თარიღი, მინიმალური თანხა), დიდიდან პატარისკენ, გვერდებად. */
export async function listDebts(f: DebtFilter): Promise<{ rows: DebtRow[]; patients: number; total: string; page: number; pageCount: number }> {
  const group = debtGroupSql(f);
  const [summary] = await prisma.$queryRaw<{ patients: bigint; total: unknown }[]>`
    SELECT COUNT(*) AS patients, COALESCE(SUM(t.debt), 0) AS total FROM (${group}) t
  `;
  const patients = int(summary.patients);
  const pageCount = Math.max(1, Math.ceil(patients / DEBTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page), pageCount);
  const rows = await prisma.$queryRaw<{ patient_id: number; invoices: bigint; debt: unknown; oldest: Date }[]>`
    SELECT * FROM (${group}) t ORDER BY t.debt DESC, t.patient_id LIMIT ${DEBTS_PAGE_SIZE} OFFSET ${(page - 1) * DEBTS_PAGE_SIZE}
  `;
  return { rows: await withPatients(rows), patients, total: fromTetri(tetri(summary.total)), page, pageCount };
}

/** ექსპორტისთვის (CSV): ყველა ჩანაწერი ფილტრით, მაქს. 50 000. */
export async function exportDebts(f: DebtFilter): Promise<DebtRow[]> {
  const rows = await prisma.$queryRaw<{ patient_id: number; invoices: bigint; debt: unknown; oldest: Date }[]>`
    SELECT * FROM (${debtGroupSql(f)}) t ORDER BY t.debt DESC, t.patient_id LIMIT 50000
  `;
  return withPatients(rows);
}

export type InsurerDebtRow = { companyId: number; name: string; invoices: number; amount: string };

/** სადაზღვევო დავალიანება პერიოდში: გაუქმებელი ინვოისების დაზღვევის წილი კომპანიების მიხედვით. */
export async function insurerDebts(from: string, to: string): Promise<InsurerDebtRow[]> {
  const range = periodRange(from, to);
  const rows = await prisma.$queryRaw<{ company_id: number; name: string; invoices: bigint; amount: unknown }[]>`
    SELECT c.id AS company_id, c.name, COUNT(*) AS invoices, SUM(i.insurance_amount) AS amount
    FROM invoices i JOIN insurance_companies c ON c.id = i.insurance_company_id
    WHERE i.insurance_company_id IS NOT NULL AND i.status <> 'cancelled' AND i.insurance_amount > 0
      AND i.created_at >= ${range.from} AND i.created_at < ${range.to}
    GROUP BY c.id, c.name
    ORDER BY amount DESC
  `;
  return rows.map((r) => ({ companyId: int(r.company_id), name: r.name, invoices: int(r.invoices), amount: fromTetri(tetri(r.amount)) }));
}
