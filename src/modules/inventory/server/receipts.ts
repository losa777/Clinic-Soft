import "server-only";
import { prisma } from "@/lib/db";
import { formatDateTime, fullName } from "@/modules/finance/server/db";
import type { GroupFilter, InventoryCategoryValue } from "@/modules/inventory/labels";
import { fromDecimal } from "@/modules/inventory/stock";
import { dateOnly, dateValue } from "./db";
import { groupCategories } from "./stock";

/**
 * შესყიდვების ანგარიში (inventory.reports): ზედნადებები პერიოდში (მიღების თარიღით) ხაზებით და ჯამებით,
 * მომწოდებლების მიხედვით. თანხა — მიღებული რაოდენობა × შესყიდვის ფასი (ფასის გარეშე ხაზი — 0, ცალკე ითვლება).
 * group — ხაზები დასახელების ჯგუფით; ზედნადები, რომელსაც შესაბამისი ხაზი არ აქვს, არ ჩანს.
 */

export type ReceiptFilter = { from: string; to: string; supplierId: number | null; group: GroupFilter };

export type ReceiptLine = {
  batchId: number;
  itemId: number;
  itemName: string;
  category: InventoryCategoryValue;
  unit: string;
  quantity: number;
  unitCost: string | null;
  /** თეთრებში (null — ფასი არ არის) */
  amountTetri: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
};

export type ReceiptDoc = {
  id: number;
  receivedOn: string;
  documentNumber: string | null;
  supplier: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  lines: ReceiptLine[];
  totalTetri: number;
  unpriced: number;
};

export type SupplierTotal = { supplierId: number | null; name: string; receipts: number; totalTetri: number };

const RECEIPTS_LIMIT = 2_000;

export async function loadReceipts(f: ReceiptFilter) {
  const categories = groupCategories(f.group);
  const rows = await prisma.inventoryReceipt.findMany({
    where: {
      // received_on — DATE (თბილისის დღე)
      receivedOn: { gte: dateValue(f.from), lte: dateValue(f.to) },
      ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      batches: {
        where: categories ? { item: { category: { in: categories } } } : {},
        include: { item: { select: { name: true, unit: true, category: true } } },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ receivedOn: "desc" }, { id: "desc" }],
    take: RECEIPTS_LIMIT,
  });

  const docs: ReceiptDoc[] = [];
  const suppliers = new Map<number | null, SupplierTotal>();
  for (const r of rows) {
    if (r.batches.length === 0) continue;
    const lines = r.batches.map(
      (b): ReceiptLine => ({
        batchId: b.id,
        itemId: b.itemId,
        itemName: b.item.name,
        category: b.item.category,
        unit: b.item.unit,
        quantity: fromDecimal(b.receivedQuantity),
        unitCost: b.unitCost?.toFixed(2) ?? null,
        // DECIMAL(12,2) × DECIMAL(12,2) → თეთრამდე მრგვალდება
        amountTetri: b.unitCost ? Math.round(b.receivedQuantity.mul(b.unitCost).toNumber() * 100) : null,
        lotNumber: b.lotNumber,
        expiryDate: dateOnly(b.expiryDate),
      }),
    );
    const totalTetri = lines.reduce((s, l) => s + (l.amountTetri ?? 0), 0);
    docs.push({
      id: r.id,
      receivedOn: dateOnly(r.receivedOn) ?? "",
      documentNumber: r.documentNumber,
      supplier: r.supplier?.name ?? null,
      note: r.note,
      createdBy: fullName(r.createdBy),
      createdAt: formatDateTime(r.createdAt),
      lines,
      totalTetri,
      unpriced: lines.filter((l) => l.amountTetri === null).length,
    });
    const key = r.supplier?.id ?? null;
    const s = suppliers.get(key) ?? { supplierId: key, name: r.supplier?.name ?? "მომწოდებლის გარეშე", receipts: 0, totalTetri: 0 };
    s.receipts += 1;
    s.totalTetri += totalTetri;
    suppliers.set(key, s);
  }

  return {
    docs,
    bySupplier: [...suppliers.values()].sort((a, b) => b.totalTetri - a.totalTetri),
    totalTetri: docs.reduce((s, d) => s + d.totalTetri, 0),
    lines: docs.reduce((s, d) => s + d.lines.length, 0),
    unpriced: docs.reduce((s, d) => s + d.unpriced, 0),
    truncated: rows.length === RECEIPTS_LIMIT,
  };
}
