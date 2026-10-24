import "server-only";
import { tbilisiToday } from "@/lib/appointment-slots";
import { allocateFefo, formatQuantity, fromDecimal, isExpired, toDecimal, usableQuantity } from "@/modules/inventory/stock";
import { notifyLowStock } from "./alerts";
import { type Db, dateOnly, dateValue, InventoryError } from "./db";

/**
 * საწყობის ოპერაციები (ტრანზაქციაში): შემოსავალი, გახარჯვა (FEFO), ჩამოწერა.
 * ნაშთი იცვლება მხოლოდ აქ — ყოველთვის მოძრაობის ჩანაწერთან ერთად. დასახელების პარტიები იკეტება (FOR UPDATE),
 * ამიტომ ერთდროული გახარჯვა ნაშთს უარყოფითს ვერ გახდის.
 */

type Line = { itemId: number; quantity: number; lotNumber: string | null; expiryDate: string | null; unitCost: string | null };

export type ReceiptData = {
  supplierId: number | null;
  documentNumber: string | null;
  receivedOn: string;
  note: string | null;
  lines: Line[];
};

export async function createReceipt(tx: Db, userId: number, data: ReceiptData): Promise<number> {
  const today = tbilisiToday();
  if (data.receivedOn > today) throw new InventoryError("შეასწორეთ მონიშნული ველები", { receivedOn: "მიღების თარიღი მომავალშია" });
  if (data.supplierId && !(await tx.inventorySupplier.count({ where: { id: data.supplierId, isActive: true } }))) {
    throw new InventoryError("შეასწორეთ მონიშნული ველები", { supplierId: "მომწოდებელი ვერ მოიძებნა" });
  }

  const ids = [...new Set(data.lines.map((l) => l.itemId))];
  const items = await tx.inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, tracksExpiry: true } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const errors: Record<string, string> = {};
  data.lines.forEach((l, i) => {
    const item = byId.get(l.itemId);
    if (!item?.isActive) errors[`lines.${i}.itemId`] = "დასახელება გათიშულია ან ვერ მოიძებნა";
    else if (item.tracksExpiry && !l.expiryDate) errors[`lines.${i}.expiryDate`] = "მიუთითეთ ვარგისიანობის ვადა";
    if (l.expiryDate && l.expiryDate < today) errors[`lines.${i}.expiryDate`] = "ვადაგასულის მიღება არ შეიძლება";
  });
  if (Object.keys(errors).length) throw new InventoryError("შეასწორეთ მონიშნული ხაზები", errors);

  const now = new Date();
  const receipt = await tx.inventoryReceipt.create({
    data: {
      supplierId: data.supplierId,
      documentNumber: data.documentNumber,
      receivedOn: dateValue(data.receivedOn),
      note: data.note,
      createdById: userId,
      createdAt: now,
    },
  });
  for (const l of data.lines) {
    const quantity = toDecimal(l.quantity);
    const batch = await tx.inventoryBatch.create({
      data: {
        itemId: l.itemId,
        receiptId: receipt.id,
        lotNumber: l.lotNumber,
        expiryDate: l.expiryDate ? dateValue(l.expiryDate) : null,
        unitCost: l.unitCost,
        receivedQuantity: quantity,
        quantity,
        createdAt: now,
      },
    });
    await tx.inventoryMovement.create({
      data: { itemId: l.itemId, batchId: batch.id, type: "receipt", quantity, receiptId: receipt.id, createdById: userId, createdAt: now },
    });
  }
  return receipt.id;
}

/** დასახელება და მისი ნაშთიანი პარტიები, ჩაკეტილი ტრანზაქციის ბოლომდე. */
async function lockItem(tx: Db, itemId: number) {
  const [item] = await tx.$queryRaw<{ id: number; name: string; unit: string; min_quantity: unknown; is_active: unknown }[]>`
    SELECT id, name, unit, min_quantity, is_active FROM inventory_items WHERE id = ${itemId} FOR UPDATE
  `;
  if (!item) throw new InventoryError("დასახელება ვერ მოიძებნა");
  const batches = await tx.$queryRaw<{ id: number; expiry_date: Date | string | null; quantity: unknown }[]>`
    SELECT id, expiry_date, quantity FROM inventory_batches WHERE item_id = ${itemId} AND quantity > 0 FOR UPDATE
  `;
  return {
    item: { id: item.id, name: item.name, unit: item.unit, isActive: Number(item.is_active) === 1, minQuantity: fromDecimal(String(item.min_quantity)) },
    batches: batches.map((b) => ({ id: b.id, expiryDate: dateOnly(b.expiry_date), quantity: fromDecimal(String(b.quantity)) })),
  };
}

export type ConsumeData = {
  itemId: number;
  quantity: number;
  note: string | null;
  /** პროცედურის/კვლევის შესრულებისას — ვისზე და რომელ დანიშნულებაზე დაიხარჯა */
  patientId?: number | null;
  medicalOrderId?: number | null;
};

/** გახარჯვა: FEFO ვარგის პარტიებზე (ერთი ოპერაცია შეიძლება რამდენიმე პარტიას შეეხოს). */
export async function consume(tx: Db, userId: number, input: ConsumeData) {
  const today = tbilisiToday();
  const { item, batches } = await lockItem(tx, input.itemId);
  if (!item.isActive) throw new InventoryError(`დასახელება გათიშულია: ${item.name}`);
  const before = usableQuantity(batches, today);
  const allocation = allocateFefo(batches, input.quantity, today);
  if (!allocation) {
    throw new InventoryError(`ნაშთი არ ჰყოფნის: ${item.name} (ვარგისი — ${formatQuantity(before)} ${item.unit})`, {
      quantity: `ვარგისი ნაშთი: ${formatQuantity(before)} ${item.unit}`,
    });
  }
  const now = new Date();
  for (const a of allocation) {
    await tx.inventoryBatch.update({ where: { id: a.batchId }, data: { quantity: { decrement: toDecimal(a.quantity) } } });
    await tx.inventoryMovement.create({
      data: {
        itemId: item.id,
        batchId: a.batchId,
        type: "consumption",
        quantity: toDecimal(-a.quantity),
        note: input.note,
        patientId: input.patientId ?? null,
        medicalOrderId: input.medicalOrderId ?? null,
        createdById: userId,
        createdAt: now,
      },
    });
  }
  await notifyLowStock(tx, item, before, before - input.quantity, item.minQuantity);
}

/** ჩამოწერა კონკრეტული პარტიიდან (ვადაგასულისაც). */
export async function writeOff(
  tx: Db,
  userId: number,
  input: { batchId: number; quantity: number; reason: "expired" | "damaged" | "lost" | "other"; note: string | null },
) {
  const batch = await tx.inventoryBatch.findUnique({ where: { id: input.batchId }, select: { itemId: true } });
  if (!batch) throw new InventoryError("პარტია ვერ მოიძებნა");
  const today = tbilisiToday();
  const { item, batches } = await lockItem(tx, batch.itemId);
  const target = batches.find((b) => b.id === input.batchId);
  if (!target || target.quantity < input.quantity) {
    throw new InventoryError("პარტიაში ნაშთი არ ჰყოფნის", { quantity: `პარტიის ნაშთი: ${formatQuantity(target?.quantity ?? 0)} ${item.unit}` });
  }
  if (input.reason === "expired" && !isExpired(target.expiryDate, today)) {
    throw new InventoryError("შეასწორეთ მონიშნული ველები", { reason: "ამ პარტიას ვადა ჯერ არ გასვლია" });
  }
  const before = usableQuantity(batches, today);
  await tx.inventoryBatch.update({ where: { id: target.id }, data: { quantity: { decrement: toDecimal(input.quantity) } } });
  await tx.inventoryMovement.create({
    data: {
      itemId: item.id,
      batchId: target.id,
      type: "writeoff",
      quantity: toDecimal(-input.quantity),
      reason: input.reason,
      note: input.note,
      createdById: userId,
      createdAt: new Date(),
    },
  });
  // ვადაგასულის ჩამოწერა ვარგის ნაშთს არ ცვლის
  const after = isExpired(target.expiryDate, today) ? before : before - input.quantity;
  await notifyLowStock(tx, item, before, after, item.minQuantity);
}

export type CountLine = { batchId: number; expected: number; counted: number };

/**
 * ინვენტარიზაცია: დათვლილი რაოდენობა პარტიებზე → სხვაობა კორექტირებით (adjustment, ± ნიშნით).
 * expected — ფორმის ჩატვირთვისას ნანახი ნაშთი: თუ ამასობაში შეიცვალა (გახარჯვა), ოპერაცია უქმდება —
 * სხვაგვარად სხვაობა არასწორად დაითვლებოდა. აბრუნებს შეცვლილი პარტიების რაოდენობას.
 */
export async function applyCount(tx: Db, userId: number, input: { note: string; lines: CountLine[] }): Promise<number> {
  const batches = await tx.inventoryBatch.findMany({
    where: { id: { in: input.lines.map((l) => l.batchId) } },
    select: { id: true, itemId: true },
  });
  const itemOf = new Map(batches.map((b) => [b.id, b.itemId]));
  const errors: Record<string, string> = {};
  const locked = new Map<number, Awaited<ReturnType<typeof lockItem>>>();
  // დასახელებები ზრდადი id-ით — ერთდროულ ოპერაციებთან deadlock-ის გარეშე
  for (const itemId of [...new Set(batches.map((b) => b.itemId))].sort((a, b) => a - b)) locked.set(itemId, await lockItem(tx, itemId));

  const now = new Date();
  let changed = 0;
  for (const l of input.lines) {
    const itemId = itemOf.get(l.batchId);
    if (itemId === undefined) {
      errors[`batch.${l.batchId}`] = "პარტია ვერ მოიძებნა";
      continue;
    }
    // ნულოვანი ნაშთის პარტიები lockItem-ში არ ჩანს
    const current = locked.get(itemId)!.batches.find((b) => b.id === l.batchId)?.quantity ?? 0;
    if (current !== l.expected) {
      errors[`batch.${l.batchId}`] = `ნაშთი ამასობაში შეიცვალა (ახლა: ${formatQuantity(current)}) — განაახლეთ გვერდი`;
      continue;
    }
    const delta = l.counted - current;
    if (delta === 0) continue;
    await tx.inventoryBatch.update({ where: { id: l.batchId }, data: { quantity: toDecimal(l.counted) } });
    await tx.inventoryMovement.create({
      data: { itemId, batchId: l.batchId, type: "adjustment", quantity: toDecimal(delta), note: input.note, createdById: userId, createdAt: now },
    });
    changed++;
  }
  if (Object.keys(errors).length) throw new InventoryError("ინვენტარიზაცია არ შეინახა — შეასწორეთ მონიშნული ხაზები", errors);
  return changed;
}
