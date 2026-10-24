import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { userWithRole } from "@/lib/user-roles";
import { fromTetri } from "@/modules/finance/calc";
import { FULL_ACCESS_ROLE } from "@/lib/permissions";
import { dayRange, formatDateTime, fullName, int, tetri } from "./db";

/**
 * დღის ანგარიში (თბილისის დღე, სურვილისამებრ — მოლარე). ყველა ჯამი SQL-ში (GROUP BY), ინდექსებით:
 * payments(created_at), invoices(created_at), invoices(cancelled_at).
 */

export type DailyReport = {
  date: string;
  cashierId: number | null;
  payments: { cash: string; card: string; total: string; count: number };
  refunds: { cash: string; card: string; total: string; count: number };
  net: { cash: string; card: string; total: string };
  invoices: { count: number; total: string; discount: string; insurance: string; patient: string };
  byService: { serviceId: number | null; name: string; quantity: number; total: string; insurance: string; patient: string }[];
  cancelledInvoices: { id: number; number: string; patient: string; amount: string; reason: string; by: string | null; at: string }[];
  refundList: { id: number; receipt: string; invoice: string; method: string; amount: string; reason: string; by: string | null; at: string }[];
};

export async function loadDailyReport(date: string, cashierId: number | null): Promise<DailyReport> {
  const { from, to } = dayRange(date);
  const byCashier = (column: Prisma.Sql) => (cashierId ? Prisma.sql`AND ${column} = ${cashierId}` : Prisma.empty);

  const [payments, invoices, byService, cancelled, refunds] = await Promise.all([
    prisma.$queryRaw<{ type: string; method: string; total: unknown; n: bigint }[]>`
      SELECT p.type, p.method, SUM(p.amount) AS total, COUNT(*) AS n
      FROM payments p
      WHERE p.created_at >= ${from} AND p.created_at < ${to} ${byCashier(Prisma.sql`p.created_by`)}
      GROUP BY p.type, p.method
    `,
    prisma.$queryRaw<{ n: bigint; total: unknown; discount: unknown; insurance: unknown; patient: unknown }[]>`
      SELECT COUNT(*) AS n, SUM(i.total_amount) AS total, SUM(i.discount_amount) AS discount,
             SUM(i.insurance_amount) AS insurance, SUM(i.patient_amount) AS patient
      FROM invoices i
      WHERE i.created_at >= ${from} AND i.created_at < ${to} AND i.status <> 'cancelled' ${byCashier(Prisma.sql`i.created_by`)}
    `,
    prisma.$queryRaw<{ service_id: number | null; name: string; quantity: unknown; total: unknown; insurance: unknown; patient: unknown }[]>`
      SELECT ii.service_id, ii.service_name AS name, SUM(ii.quantity) AS quantity, SUM(ii.total_amount) AS total,
             SUM(ii.insurance_amount) AS insurance, SUM(ii.patient_amount) AS patient
      FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.created_at >= ${from} AND i.created_at < ${to} AND i.status <> 'cancelled' ${byCashier(Prisma.sql`i.created_by`)}
      GROUP BY ii.service_id, ii.service_name
      ORDER BY total DESC
      LIMIT 500
    `,
    prisma.invoice.findMany({
      where: { status: "cancelled", cancelledAt: { gte: from, lt: to }, ...(cashierId ? { cancelledById: cashierId } : {}) },
      include: { patient: { select: { firstName: true, lastName: true } }, cancelledBy: { select: { firstName: true, lastName: true } } },
      orderBy: { cancelledAt: "asc" },
      take: 200,
    }),
    prisma.payment.findMany({
      where: { type: "refund", createdAt: { gte: from, lt: to }, ...(cashierId ? { createdById: cashierId } : {}) },
      include: { invoice: { select: { invoiceNumber: true } }, createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
  ]);

  const sum = (type: string, method?: string) =>
    payments.filter((p) => p.type === type && (!method || p.method === method)).reduce((s, p) => s + tetri(p.total), 0);
  const count = (type: string) => payments.filter((p) => p.type === type).reduce((s, p) => s + int(p.n), 0);
  const inv = invoices[0];

  return {
    date,
    cashierId,
    payments: { cash: fromTetri(sum("payment", "cash")), card: fromTetri(sum("payment", "card")), total: fromTetri(sum("payment")), count: count("payment") },
    refunds: { cash: fromTetri(sum("refund", "cash")), card: fromTetri(sum("refund", "card")), total: fromTetri(sum("refund")), count: count("refund") },
    net: {
      cash: fromTetri(sum("payment", "cash") - sum("refund", "cash")),
      card: fromTetri(sum("payment", "card") - sum("refund", "card")),
      total: fromTetri(sum("payment") - sum("refund")),
    },
    invoices: {
      count: int(inv?.n),
      total: fromTetri(tetri(inv?.total)),
      discount: fromTetri(tetri(inv?.discount)),
      insurance: fromTetri(tetri(inv?.insurance)),
      patient: fromTetri(tetri(inv?.patient)),
    },
    byService: byService.map((s) => ({
      serviceId: s.service_id === null ? null : int(s.service_id),
      name: s.name,
      quantity: int(s.quantity),
      total: fromTetri(tetri(s.total)),
      insurance: fromTetri(tetri(s.insurance)),
      patient: fromTetri(tetri(s.patient)),
    })),
    cancelledInvoices: cancelled.map((i) => ({
      id: i.id,
      number: i.invoiceNumber,
      patient: fullName(i.patient)!,
      amount: i.totalAmount.toFixed(2),
      reason: i.cancelReason ?? "",
      by: fullName(i.cancelledBy),
      at: i.cancelledAt ? formatDateTime(i.cancelledAt) : "",
    })),
    refundList: refunds.map((p) => ({
      id: p.id,
      receipt: p.receiptNumber,
      invoice: p.invoice.invoiceNumber,
      method: p.method,
      amount: p.amount.toFixed(2),
      reason: p.reason ?? "",
      by: fullName(p.createdBy),
      at: formatDateTime(p.createdAt),
    })),
  };
}

/** მოლარეების სია ფილტრისთვის: აქტიური მომხმარებლები, ვისაც გადახდის მიღება შეუძლია. */
export async function loadCashiers(): Promise<{ id: number; name: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...userWithRole({ OR: [{ code: FULL_ACCESS_ROLE }, { permissions: { some: { permission: { code: "payments.create" } } } }] }),
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return users.map((u) => ({ id: u.id, name: fullName(u)! }));
}
