import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { addDays, tbilisiToDate, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { formatDateTime, fullName } from "@/modules/finance/server/db";
import { GENERAL_CATEGORIES, type GroupFilter, type InventoryCategoryValue, MEDICAL_CATEGORIES, type MovementTypeValue, type WriteoffReasonValue } from "@/modules/inventory/labels";
import { expiryStatus, type ExpiryStatus, fromDecimal, stockLevel, type StockLevel } from "@/modules/inventory/stock";
import { dateOnly } from "./db";

/**
 * ნაშთები: დასახელებები პარტიების ჯამით (ერთი SQL). value — ნაშთის ღირებულება შესყიდვის ფასით
 * (ფასის გარეშე მიღებული პარტია — 0). რაოდენობები — მეასედებში (stock.ts).
 */

export type StockRow = {
  id: number;
  name: string;
  category: InventoryCategoryValue;
  unit: string;
  isActive: boolean;
  tracksExpiry: boolean;
  minQuantity: number;
  /** ყველა პარტია (ვადაგასულის ჩათვლით) */
  total: number;
  /** ვარგისი (ვადაგაუსვლელი) */
  usable: number;
  expired: number;
  /** უახლოესი ვადა ვარგის პარტიებში */
  nextExpiry: string | null;
  nextExpiryStatus: ExpiryStatus;
  level: StockLevel;
  /** ფილტრისთვის: ვადაგასული ნაშთი თუ არის — "expired", სხვაგვარად უახლოესი ვადის მდგომარეობა */
  expiry: ExpiryStatus;
  /** ღირებულება თეთრებში */
  valueTetri: number;
};

type StockSqlRow = {
  id: number;
  name: string;
  category: InventoryCategoryValue;
  unit: string;
  is_active: unknown;
  tracks_expiry: unknown;
  min_quantity: unknown;
  total: unknown;
  usable: unknown;
  expired: unknown;
  next_expiry: Date | string | null;
  value: unknown;
};

const bool = (v: unknown) => v === true || Number(v) === 1;
const dec = (v: unknown) => fromDecimal(v === null || v === undefined ? null : String(v));

export async function loadStock(filter: { itemId?: number } = {}): Promise<StockRow[]> {
  const today = tbilisiToday();
  const rows = await prisma.$queryRaw<StockSqlRow[]>`
    SELECT i.id, i.name, i.category, i.unit, i.is_active, i.tracks_expiry, i.min_quantity,
           COALESCE(SUM(b.quantity), 0) AS total,
           COALESCE(SUM(CASE WHEN b.expiry_date IS NULL OR b.expiry_date >= ${today} THEN b.quantity END), 0) AS usable,
           COALESCE(SUM(CASE WHEN b.expiry_date < ${today} THEN b.quantity END), 0) AS expired,
           MIN(CASE WHEN b.expiry_date >= ${today} THEN b.expiry_date END) AS next_expiry,
           COALESCE(SUM(b.quantity * COALESCE(b.unit_cost, 0)), 0) AS value
    FROM inventory_items i
    LEFT JOIN inventory_batches b ON b.item_id = i.id AND b.quantity > 0
    WHERE 1 = 1 ${filter.itemId ? Prisma.sql`AND i.id = ${filter.itemId}` : Prisma.empty}
    GROUP BY i.id
    ORDER BY i.name
  `;
  return rows.map((r) => {
    const usable = dec(r.usable);
    const minQuantity = dec(r.min_quantity);
    const expired = dec(r.expired);
    const nextExpiry = dateOnly(r.next_expiry);
    const status = expiryStatus(nextExpiry, today);
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      unit: r.unit,
      isActive: bool(r.is_active),
      tracksExpiry: bool(r.tracks_expiry),
      minQuantity,
      total: dec(r.total),
      usable,
      expired,
      nextExpiry,
      nextExpiryStatus: status,
      level: stockLevel(usable, minQuantity),
      // ვადაგასული ნაშთი (ჩამოსაწერი) უფრო მნიშვნელოვანია, ვიდრე ახლოს მყოფი ვადა
      expiry: expired > 0 ? "expired" : status,
      // DECIMAL(12,2) × DECIMAL(12,2) → 4 ათწილადი; თეთრამდე მრგვალდება
      valueTetri: Math.round(Number(r.value ?? 0) * 100),
    };
  });
}

export type BatchRow = {
  id: number;
  lotNumber: string | null;
  expiryDate: string | null;
  expiry: ExpiryStatus;
  unitCost: string | null;
  received: number;
  quantity: number;
  receivedOn: string | null;
  supplier: string | null;
};

export type MovementRow = {
  id: string;
  at: string;
  itemId: number;
  itemName: string;
  unit: string;
  type: MovementTypeValue;
  quantity: number;
  reason: WriteoffReasonValue | null;
  note: string | null;
  /** ვის/სად გაიცა (სამეურნეო) */
  recipient: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  documentNumber: string | null;
  supplier: string | null;
  patient: string | null;
  user: string | null;
};

const movementInclude = {
  item: { select: { name: true, unit: true } },
  batch: { select: { lotNumber: true, expiryDate: true } },
  receipt: { select: { documentNumber: true, supplier: { select: { name: true } } } },
  patient: { select: { firstName: true, lastName: true } },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.InventoryMovementInclude;

type MovementWithRelations = Prisma.InventoryMovementGetPayload<{ include: typeof movementInclude }>;

function toMovementRow(m: MovementWithRelations): MovementRow {
  return {
    id: String(m.id),
    at: formatDateTime(m.createdAt),
    itemId: m.itemId,
    itemName: m.item.name,
    unit: m.item.unit,
    type: m.type,
    quantity: fromDecimal(m.quantity),
    reason: m.reason,
    note: m.note,
    recipient: m.recipient,
    lotNumber: m.batch.lotNumber,
    expiryDate: dateOnly(m.batch.expiryDate),
    documentNumber: m.receipt?.documentNumber ?? null,
    supplier: m.receipt?.supplier?.name ?? null,
    patient: fullName(m.patient),
    user: fullName(m.createdBy),
  };
}

/** დასახელების ბარათი: ნაშთი, ნაშთიანი პარტიები (FEFO რიგით) და ბოლო მოძრაობები. */
export async function loadItem(id: number) {
  const [stock] = await loadStock({ itemId: id });
  if (!stock) return null;
  const today = tbilisiToday();
  const [item, batches, movements] = await Promise.all([
    prisma.inventoryItem.findUnique({ where: { id }, select: { note: true } }),
    prisma.inventoryBatch.findMany({
      where: { itemId: id, quantity: { gt: 0 } },
      include: { receipt: { select: { receivedOn: true, supplier: { select: { name: true } } } } },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    }),
    prisma.inventoryMovement.findMany({ where: { itemId: id }, include: movementInclude, orderBy: { id: "desc" }, take: 30 }),
  ]);
  return {
    stock,
    note: item?.note ?? null,
    batches: batches.map(
      (b): BatchRow => ({
        id: b.id,
        lotNumber: b.lotNumber,
        expiryDate: dateOnly(b.expiryDate),
        expiry: expiryStatus(dateOnly(b.expiryDate), today),
        unitCost: b.unitCost?.toFixed(2) ?? null,
        received: fromDecimal(b.receivedQuantity),
        quantity: fromDecimal(b.quantity),
        receivedOn: dateOnly(b.receipt?.receivedOn),
        supplier: b.receipt?.supplier?.name ?? null,
      }),
    ),
    movements: movements.map(toMovementRow),
  };
}

export const MOVEMENTS_PAGE_SIZE = 50;
const EXPORT_LIMIT = 50_000;

/** group — სამედიცინო/სამეურნეო (ექთანს/ლაბორანტს — ყოველთვის სამედიცინო, src/modules/inventory/access.ts). */
export type MovementFilter = { from: string; to: string; type: MovementTypeValue | null; itemId: number | null; group: GroupFilter; page: number };

/** ჯგუფის პირობა დასახელების კატეგორიაზე. */
export const groupCategories = (group: GroupFilter) => (group === "medical" ? MEDICAL_CATEGORIES : group === "general" ? GENERAL_CATEGORIES : null);

function movementWhere(f: MovementFilter): Prisma.InventoryMovementWhereInput {
  const categories = groupCategories(f.group);
  return {
    ...(categories ? { item: { category: { in: categories } } } : {}),
    // პერიოდი თბილისის დღეებით
    createdAt: { gte: tbilisiToDate(f.from, 0), lt: tbilisiToDate(addDays(f.to, 1), 0) },
    ...(f.type ? { type: f.type } : {}),
    ...(f.itemId ? { itemId: f.itemId } : {}),
  };
}

export async function listMovements(f: MovementFilter) {
  const where = movementWhere(f);
  const count = await prisma.inventoryMovement.count({ where });
  const pageCount = Math.max(1, Math.ceil(count / MOVEMENTS_PAGE_SIZE));
  const page = Math.min(f.page, pageCount);
  const rows = await prisma.inventoryMovement.findMany({
    where,
    include: movementInclude,
    orderBy: { id: "desc" },
    skip: (page - 1) * MOVEMENTS_PAGE_SIZE,
    take: MOVEMENTS_PAGE_SIZE,
  });
  return { rows: rows.map(toMovementRow), count, page, pageCount };
}

export async function exportMovements(f: MovementFilter) {
  const rows = await prisma.inventoryMovement.findMany({ where: movementWhere(f), include: movementInclude, orderBy: { id: "asc" }, take: EXPORT_LIMIT });
  return rows.map(toMovementRow);
}

/** ფორმებისთვის: აქტიური დასახელებები და მომწოდებლები. */
export async function loadPickerData() {
  const [items, suppliers] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unit: true, tracksExpiry: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventorySupplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { items, suppliers };
}

export type PickerItemData = Awaited<ReturnType<typeof loadPickerData>>["items"][number];
