"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";

const PATH = "/admin/banks";

const bankSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "შეიყვანეთ ბანკის დასახელება").max(100, "მაქსიმუმ 100 სიმბოლო"),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});
export type BankInput = z.input<typeof bankSchema>;

/** ბანკის დამატება/რედაქტირება (ადმინი). გათიშული ბანკი გადახდის ფორმაში აღარ ჩანს, ძველი გადახდები რჩება. */
export async function saveBankAction(input: BankInput): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsed = bankSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;
  try {
    if (id) {
      const { count } = await prisma.bank.updateMany({ where: { id }, data });
      if (!count) return failure("ბანკი ვერ მოიძებნა");
    } else {
      await prisma.bank.create({ data: { ...data, createdAt: new Date() } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return failure("შეასწორეთ მონიშნული ველები", { name: "ეს ბანკი უკვე დამატებულია" });
    throw error;
  }
  await audit({ userId: Number(me.id), action: id ? "update" : "create", entity: "bank", entityId: id ?? null, details: data.name });
  revalidatePath(PATH);
  return success(id ? "ცვლილებები შენახულია" : `ბანკი „${data.name}“ დაემატა`);
}

/** წაშლა — მხოლოდ თუ ბანკით გადახდა ჯერ არ ყოფილა (სხვაგვარად — გათიშეთ). */
export async function deleteBankAction(id: number): Promise<ActionResult> {
  const me = await requireRole("admin");
  if (!z.number().int().positive().safeParse(id).success) return failure("ბანკი ვერ მოიძებნა");
  const bank = await prisma.bank.findUnique({ where: { id }, select: { name: true, _count: { select: { payments: true } } } });
  if (!bank) return failure("ბანკი ვერ მოიძებნა");
  if (bank._count.payments) return failure(`„${bank.name}“-ით უკვე ${bank._count.payments} გადახდაა — წაშლის ნაცვლად გათიშეთ`);
  await prisma.bank.delete({ where: { id } });
  await audit({ userId: Number(me.id), action: "delete", entity: "bank", entityId: id, details: bank.name });
  revalidatePath(PATH);
  return success(`ბანკი „${bank.name}“ წაიშალა`);
}
