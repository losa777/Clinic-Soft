"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, failure, isUniqueViolation, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { emitLive } from "@/lib/live";
import { managesGeneral } from "@/modules/inventory/access";
import { type InventoryCategoryValue, MEDICAL_CATEGORIES } from "@/modules/inventory/labels";
import { INVENTORY_ROUTES } from "@/modules/inventory/routes";
import {
  type ConsumeInput,
  consumeSchema,
  type CountInput,
  countSchema,
  type ItemInput,
  issuePaths,
  itemSchema,
  type NormsInput,
  normsSchema,
  type ReceiptInput,
  receiptSchema,
  type SupplierInput,
  supplierSchema,
  type WriteoffInput,
  writeoffSchema,
} from "@/modules/inventory/schema";
import { formatQuantity, toDecimal } from "@/modules/inventory/stock";
import { inventoryFailure, inventoryTx } from "@/modules/inventory/server/db";
import { replaceNorms } from "@/modules/inventory/server/norms";
import { applyCount, consume, createReceipt, writeOff } from "@/modules/inventory/server/operations";

/** საწყობის ყველა გვერდი (ყველა როლის) — ნაშთი ყველგან ერთნაირად უნდა ჩანდეს. */
function revalidateInventory() {
  for (const r of Object.values(INVENTORY_ROUTES)) revalidatePath(r.stock, "layout");
  emitLive(["inventory"]);
}

const invalidInput = (fieldErrors: Record<string, string>) => failure("შეასწორეთ მონიშნული ველები", fieldErrors);

/** დასახელების დამატება/რედაქტირება (inventory.manage). ნაშთი აქ არ იცვლება — მხოლოდ მოძრაობებით. */
export async function saveItemAction(input: ItemInput): Promise<ActionResult> {
  await requirePermission("inventory.manage");
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return invalidInput(issuePaths(parsed.error));
  const { id, minQuantity, category, ...rest } = parsed.data;
  const data = { ...rest, category: category as InventoryCategoryValue, minQuantity: toDecimal(minQuantity), updatedAt: new Date() };
  try {
    if (id) {
      const { count } = await prisma.inventoryItem.updateMany({ where: { id }, data });
      if (!count) return failure("დასახელება ვერ მოიძებნა");
    } else {
      await prisma.inventoryItem.create({ data: { ...data, createdAt: new Date() } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return invalidInput({ name: "ეს დასახელება უკვე არსებობს" });
    throw error;
  }
  revalidateInventory();
  return success(id ? "ცვლილებები შენახულია" : `„${data.name}“ დაემატა კატალოგში`);
}

/** გათიშვა/ჩართვა: გათიშული აღარ ჩანს შემოსავლისა და გახარჯვის ფორმებში (ისტორია რჩება). */
export async function setItemActiveAction(id: number, isActive: boolean): Promise<ActionResult> {
  await requirePermission("inventory.manage");
  const { count } = await prisma.inventoryItem.updateMany({ where: { id }, data: { isActive: Boolean(isActive), updatedAt: new Date() } });
  if (!count) return failure("დასახელება ვერ მოიძებნა");
  revalidateInventory();
  return success(isActive ? "დასახელება გააქტიურდა" : "დასახელება გაითიშა");
}

export async function saveSupplierAction(input: SupplierInput): Promise<ActionResult> {
  await requirePermission("inventory.manage");
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return invalidInput(issuePaths(parsed.error));
  const { id, ...data } = parsed.data;
  try {
    if (id) {
      const { count } = await prisma.inventorySupplier.updateMany({ where: { id }, data });
      if (!count) return failure("მომწოდებელი ვერ მოიძებნა");
    } else {
      await prisma.inventorySupplier.create({ data: { ...data, createdAt: new Date() } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return invalidInput({ name: "ეს მომწოდებელი უკვე არსებობს" });
    throw error;
  }
  revalidateInventory();
  return success(id ? "ცვლილებები შენახულია" : `მომწოდებელი „${data.name}“ დაემატა`);
}

/** შემოსავალი (inventory.receive): ზედნადები → პარტიები და მოძრაობები ერთ ტრანზაქციაში. */
export async function createReceiptAction(input: ReceiptInput): Promise<ActionResult> {
  const me = await requirePermission("inventory.receive");
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return invalidInput(issuePaths(parsed.error));
  try {
    await inventoryTx((tx) => createReceipt(tx, Number(me.id), parsed.data));
  } catch (error) {
    return inventoryFailure(error);
  }
  revalidateInventory();
  return success(`შემოსავალი აღირიცხა: ${parsed.data.lines.length} ხაზი`);
}

/** გახარჯვა (inventory.consume): FEFO-თი, ვადაგასული პარტიების გარეშე. */
export async function consumeAction(input: ConsumeInput): Promise<ActionResult> {
  const me = await requirePermission("inventory.consume");
  const parsed = consumeSchema.safeParse(input);
  if (!parsed.success) return invalidInput(issuePaths(parsed.error));
  try {
    await inventoryTx((tx) => consume(tx, Number(me.id), { ...parsed.data, allowGeneral: managesGeneral(me) }));
  } catch (error) {
    return inventoryFailure(error);
  }
  revalidateInventory();
  return success(`გახარჯულია: ${formatQuantity(parsed.data.quantity)}`);
}

/** სერვისის ნორმა (inventory.manage): ხაზები მთლიანად იცვლება. */
export async function saveNormsAction(input: NormsInput): Promise<ActionResult> {
  await requirePermission("inventory.manage");
  const parsed = normsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(issuePaths(parsed.error));
  const { serviceId, lines } = parsed.data;
  const [service, items] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId }, select: { name: true } }),
    // ნორმაში მხოლოდ სამედიცინო (სამეურნეო პაციენტზე არ იხარჯება)
    prisma.inventoryItem.count({ where: { id: { in: lines.map((l) => l.itemId) }, isActive: true, category: { in: MEDICAL_CATEGORIES } } }),
  ]);
  if (!service) return failure("სერვისი ვერ მოიძებნა");
  if (items !== lines.length) return failure("ზოგიერთი დასახელება გათიშულია, ვერ მოიძებნა ან სამეურნეოა");
  await prisma.$transaction((tx) => replaceNorms(tx, serviceId, lines.map((l) => ({ itemId: l.itemId, quantity: toDecimal(l.quantity) }))));
  revalidateInventory();
  return success(lines.length ? `ნორმა შენახულია: ${service.name}` : `ნორმა წაიშალა: ${service.name}`);
}

/** ინვენტარიზაცია (inventory.manage): დათვლილი რაოდენობები → კორექტირება. */
export async function applyCountAction(input: CountInput): Promise<ActionResult> {
  const me = await requirePermission("inventory.manage");
  const parsed = countSchema.safeParse(input);
  if (!parsed.success) return invalidInput(issuePaths(parsed.error));
  let changed: number;
  try {
    changed = await inventoryTx((tx) => applyCount(tx, Number(me.id), parsed.data));
  } catch (error) {
    return inventoryFailure(error);
  }
  revalidateInventory();
  return success(changed ? `ინვენტარიზაცია შენახულია: შეიცვალა ${changed} პარტია` : "სხვაობა არ არის — ნაშთი ემთხვევა");
}

/** ჩამოწერა (inventory.manage): კონკრეტული პარტიიდან, მიზეზით. */
export async function writeoffAction(input: WriteoffInput): Promise<ActionResult> {
  const me = await requirePermission("inventory.manage");
  const parsed = writeoffSchema.safeParse(input);
  if (!parsed.success) return invalidInput(issuePaths(parsed.error));
  const data = { ...parsed.data, reason: parsed.data.reason as "expired" | "damaged" | "lost" | "other" };
  try {
    await inventoryTx((tx) => writeOff(tx, Number(me.id), data));
  } catch (error) {
    return inventoryFailure(error);
  }
  revalidateInventory();
  return success(`ჩამოწერილია: ${formatQuantity(data.quantity)}`);
}
