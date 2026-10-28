import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { fromTetri } from "@/modules/finance/calc";
import type { BankOption, BankRow, BankTotal } from "@/modules/finance/types";
import { type Db, tetri } from "./db";
import { FinanceError } from "./errors";

/**
 * ბანკები ბარათით გადახდისთვის: აქტიური — გადახდის ფორმაში (რიგით), ყველა — ადმინის სიაში.
 * გამოყენებული ბანკი არ იშლება (გადახდები მას ინახავს) — ითიშება.
 */

export async function loadActiveBanks(db: Db = prisma): Promise<BankOption[]> {
  return db.bank.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

export async function loadBanksAdmin(): Promise<BankRow[]> {
  const banks = await prisma.bank.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { payments: true } } } });
  return banks.map((b) => ({ id: b.id, name: b.name, isActive: b.isActive, sortOrder: b.sortOrder, payments: b._count.payments }));
}

/**
 * ბანკიდან შემოსული თანხები (ბარათით) პერიოდში: გადახდა, დაბრუნება, წმინდა — ბანკის მიხედვით, ჯამი SQL-ში
 * (idx_payments_created_at). cashierId — მხოლოდ ამ მოლარის. ბანკის გარეშე (ძველი გადახდები) — ცალკე ხაზი, ბოლოს.
 */
export async function loadBankTotals(from: Date, to: Date, cashierId: number | null = null): Promise<BankTotal[]> {
  const rows = await prisma.$queryRaw<{ bank_id: number | null; name: string | null; type: string; total: unknown; n: bigint }[]>`
    SELECT p.bank_id, b.name, p.type, SUM(p.amount) AS total, COUNT(*) AS n
    FROM payments p LEFT JOIN banks b ON b.id = p.bank_id
    WHERE p.method = 'card' AND p.created_at >= ${from} AND p.created_at < ${to}
      ${cashierId ? Prisma.sql`AND p.created_by = ${cashierId}` : Prisma.empty}
    GROUP BY p.bank_id, b.name, p.type
  `;
  const banks = new Map<number | null, { name: string; payments: number; refunds: number; count: number }>();
  for (const r of rows) {
    const id = r.bank_id === null ? null : Number(r.bank_id);
    const entry = banks.get(id) ?? { name: r.name ?? "ბანკი არ არის მითითებული", payments: 0, refunds: 0, count: 0 };
    if (r.type === "refund") entry.refunds += tetri(r.total);
    else {
      entry.payments += tetri(r.total);
      entry.count += Number(r.n);
    }
    banks.set(id, entry);
  }
  return [...banks.entries()]
    .sort(([a, x], [b, y]) => (a === null ? 1 : b === null ? -1 : y.payments - x.payments))
    .map(([bankId, b]) => ({ bankId, name: b.name, payments: fromTetri(b.payments), refunds: fromTetri(b.refunds), net: fromTetri(b.payments - b.refunds), count: b.count }));
}

/**
 * ბარათით ოპერაციის ბანკი: აქტიური ბანკები თუ არსებობს — არჩევა სავალდებულოა და ბანკი აქტიური უნდა იყოს;
 * ბანკი არ არის დამატებული — null (ძველებურად). ნაღდზე — ყოველთვის null.
 */
export async function resolveCardBank(tx: Db, method: "cash" | "card", bankId: number | null): Promise<number | null> {
  if (method !== "card") return null;
  if (bankId) {
    const bank = await tx.bank.findFirst({ where: { id: bankId, isActive: true }, select: { id: true } });
    if (!bank) throw new FinanceError("ბანკი ვერ მოიძებნა ან გათიშულია — განაახლეთ გვერდი", { bankId: "აირჩიეთ ბანკი" });
    return bank.id;
  }
  if (await tx.bank.count({ where: { isActive: true } })) throw new FinanceError("აირჩიეთ, რომელი ბანკის ბარათით იხდის", { bankId: "აირჩიეთ ბანკი" });
  return null;
}
