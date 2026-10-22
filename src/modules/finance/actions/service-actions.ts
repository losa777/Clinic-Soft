"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { toTetri } from "@/modules/finance/calc";
import { type CategoryInput, categorySchema, type ServiceInput, serviceSchema } from "@/modules/finance/schema";

const PATH = "/admin/services";
const NAME_TAKEN = { name: "ამ დასახელებით სერვისი უკვე არსებობს" };

/**
 * სერვისის დამატება/რედაქტირება (services.manage). ფასის ცვლილება ისტორიაში იწერება იმავე ტრანზაქციაში;
 * უკვე გაცემულ ინვოისებს არ ეხება (ხაზებში ფასი შექმნის მომენტისაა).
 */
export async function saveServiceAction(input: ServiceInput): Promise<ActionResult> {
  const me = await requirePermission("services.manage");
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;

  if (!(await prisma.serviceCategory.count({ where: { id: data.categoryId } }))) {
    return failure("შეასწორეთ მონიშნული ველები", { categoryId: "კატეგორია ვერ მოიძებნა" });
  }

  try {
    if (!id) {
      await prisma.service.create({ data });
    } else {
      const found = await prisma.$transaction(async (tx) => {
        const current = await tx.service.findUnique({ where: { id }, select: { price: true } });
        if (!current) return false;
        await tx.service.update({ where: { id }, data });
        if (toTetri(current.price.toFixed(2)) !== toTetri(data.price)) {
          await tx.servicePriceHistory.create({
            data: { serviceId: id, oldPrice: current.price, newPrice: data.price, changedById: Number(me.id), changedAt: new Date() },
          });
        }
        return true;
      });
      if (!found) return failure("სერვისი ვერ მოიძებნა");
    }
  } catch (error) {
    if (isUniqueViolation(error)) return failure("სერვისი უკვე არსებობს", NAME_TAKEN);
    throw error;
  }
  revalidatePath(PATH);
  return success(id ? "ცვლილებები შენახულია" : `სერვისი „${data.name}“ დაემატა`);
}

/** დეაქტივაცია/აქტივაცია (სერვისი არ იშლება — ინვოისებშია გამოყენებული). */
export async function setServiceActiveAction(id: number, isActive: boolean): Promise<ActionResult> {
  await requirePermission("services.manage");
  const { count } = await prisma.service.updateMany({ where: { id }, data: { isActive: Boolean(isActive) } });
  if (!count) return failure("სერვისი ვერ მოიძებნა");
  revalidatePath(PATH);
  return success(isActive ? "სერვისი გააქტიურდა" : "სერვისი გაითიშა — ახალ ინვოისებში აღარ ჩანს");
}

export async function saveCategoryAction(input: CategoryInput): Promise<ActionResult> {
  await requirePermission("services.manage");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, name, orderType } = parsed.data;
  try {
    if (id) {
      const { count } = await prisma.serviceCategory.updateMany({ where: { id }, data: { name, orderType } });
      if (!count) return failure("კატეგორია ვერ მოიძებნა");
    } else {
      await prisma.serviceCategory.create({ data: { name, orderType } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return failure("კატეგორია უკვე არსებობს", { name: "ეს კატეგორია უკვე არსებობს" });
    throw error;
  }
  revalidatePath(PATH);
  return success(id ? "კატეგორია შეიცვალა" : `კატეგორია „${name}“ დაემატა`);
}