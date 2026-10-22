"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requireAnyPermission, requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { type CompanyInput, companySchema, type ContractInput, contractSchema, type PolicyInput, policySchema } from "@/modules/finance/schema";

const ADMIN_PATH = "/admin/insurance";

/** პაციენტის პოლისის დამატება (invoices.create ან insurance.manage) — რეგისტრატურა პოლისს ინვოისამდე ამატებს. */
export async function addPolicyAction(input: PolicyInput): Promise<ActionResult> {
  const me = await requireAnyPermission("invoices.create", "insurance.manage");
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { patientId, companyId, policyNumber, validFrom, validTo } = parsed.data;

  const [patient, company] = await Promise.all([
    prisma.patient.count({ where: { id: patientId } }),
    prisma.insuranceCompany.findFirst({ where: { id: companyId, isActive: true } }),
  ]);
  if (!patient) return failure("პაციენტი ვერ მოიძებნა");
  if (!company) return failure("შეასწორეთ მონიშნული ველები", { companyId: "კომპანია ვერ მოიძებნა ან გათიშულია" });

  await prisma.patientInsurance.create({
    data: {
      patientId,
      companyId,
      policyNumber,
      validFrom: new Date(`${validFrom}T00:00:00Z`),
      validTo: new Date(`${validTo}T00:00:00Z`),
      createdById: Number(me.id),
      createdAt: new Date(),
    },
  });
  return success(`პოლისი დაემატა: ${company.name}, ${policyNumber}`);
}

/** პოლისის გათიშვა (არ იშლება — ძველ ინვოისებშია გამოყენებული). */
export async function deactivatePolicyAction(policyId: number): Promise<ActionResult> {
  await requireAnyPermission("invoices.create", "insurance.manage");
  if (!Number.isInteger(policyId) || policyId <= 0) return failure("პოლისი ვერ მოიძებნა");
  const { count } = await prisma.patientInsurance.updateMany({ where: { id: policyId, isActive: true }, data: { isActive: false } });
  return count ? success("პოლისი გაითიშა") : failure("პოლისი ვერ მოიძებნა ან უკვე გათიშულია");
}

export async function saveCompanyAction(input: CompanyInput): Promise<ActionResult> {
  await requirePermission("insurance.manage");
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...data } = parsed.data;
  try {
    if (id) {
      const { count } = await prisma.insuranceCompany.updateMany({ where: { id }, data });
      if (!count) return failure("კომპანია ვერ მოიძებნა");
    } else {
      await prisma.insuranceCompany.create({ data });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return failure("კომპანია უკვე არსებობს", { name: "ეს დასახელება უკვე არსებობს" });
    throw error;
  }
  revalidatePath(ADMIN_PATH);
  return success(id ? "ცვლილებები შენახულია" : `კომპანია „${data.name}“ დაემატა`);
}

/** პირობა სერვისზე ან კატეგორიაზე. იგივე სერვისზე/კატეგორიაზე მეორე პირობა არ ემატება (UNIQUE). */
export async function saveContractAction(input: ContractInput): Promise<ActionResult> {
  await requirePermission("insurance.manage");
  const parsed = contractSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, companyId, target, serviceId, categoryId, coveragePercent, limitAmount } = parsed.data;
  const data = {
    companyId,
    serviceId: target === "service" ? serviceId : null,
    categoryId: target === "category" ? categoryId : null,
    coveragePercent,
    limitAmount,
  };
  try {
    if (id) {
      const { count } = await prisma.insuranceContract.updateMany({ where: { id, companyId }, data });
      if (!count) return failure("პირობა ვერ მოიძებნა");
    } else {
      await prisma.insuranceContract.create({ data });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return failure("ამ კომპანიას ეს სერვისი/კატეგორია უკვე აქვს პირობებში — შეცვალეთ არსებული", { targetId: "უკვე არსებობს" });
    }
    throw error;
  }
  revalidatePath(ADMIN_PATH);
  return success("პირობა შენახულია. ახალ ინვოისებზე იმოქმედებს (არსებული არ იცვლება)");
}

/** პირობის წაშლა: ეს კონფიგურაციაა (ფინანსური ჩანაწერი არა) — უკვე შექმნილი ინვოისები არ იცვლება. */
export async function deleteContractAction(id: number): Promise<ActionResult> {
  await requirePermission("insurance.manage");
  const parsed = z.number().int().positive().safeParse(id);
  if (!parsed.success) return failure("პირობა ვერ მოიძებნა");
  const { count } = await prisma.insuranceContract.deleteMany({ where: { id: parsed.data } });
  revalidatePath(ADMIN_PATH);
  return count ? success("პირობა წაიშალა") : failure("პირობა ვერ მოიძებნა");
}
