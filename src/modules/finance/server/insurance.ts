import "server-only";
import { prisma } from "@/lib/db";
import type { PolicyRow } from "@/modules/finance/components/patient-policies";
import type { NewPatientPolicy } from "@/modules/finance/schema";
import { type Db, formatDay, todayAsDate } from "./db";
import { FinanceError } from "./errors";

export async function loadPatientPolicies(patientId: number): Promise<PolicyRow[]> {
  const today = todayAsDate().getTime();
  const policies = await prisma.patientInsurance.findMany({
    where: { patientId },
    include: { company: { select: { name: true, isActive: true } } },
    orderBy: [{ isActive: "desc" }, { validTo: "desc" }],
    take: 50,
  });
  return policies.map((p) => ({
    id: p.id,
    company: p.company.name,
    policyNumber: p.policyNumber,
    validFrom: formatDay(p.validFrom),
    validTo: formatDay(p.validTo),
    isActive: p.isActive,
    isCurrent: p.isActive && p.company.isActive && p.validFrom.getTime() <= today && p.validTo.getTime() >= today,
  }));
}

/** ახალი პაციენტის პოლისი (პაციენტის შექმნის ტრანზაქციაში). კომპანია უნდა იყოს აქტიური. */
export async function createPatientPolicy(tx: Db, patientId: number, policy: NewPatientPolicy, userId: number) {
  const company = await tx.insuranceCompany.findFirst({ where: { id: policy.policyCompanyId, isActive: true }, select: { id: true } });
  if (!company) throw new FinanceError("შეასწორეთ მონიშნული ველები", { policyCompanyId: "კომპანია ვერ მოიძებნა ან გათიშულია" });
  await tx.patientInsurance.create({
    data: {
      patientId,
      companyId: company.id,
      policyNumber: policy.policyNumber,
      validFrom: new Date(`${policy.policyValidFrom}T00:00:00Z`),
      validTo: new Date(`${policy.policyValidTo}T00:00:00Z`),
      createdById: userId,
      createdAt: new Date(),
    },
  });
}

export async function loadActiveCompanies(): Promise<{ id: number; name: string }[]> {
  return prisma.insuranceCompany.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export type CompanyAdminRow = {
  id: number;
  name: string;
  isActive: boolean;
  contracts: {
    id: number;
    target: "service" | "category";
    targetId: number;
    targetName: string;
    coveragePercent: string;
    limitAmount: string | null;
  }[];
};

/** ადმინის გვერდისთვის: კომპანიები პირობებით, სერვისები და კატეგორიები ასარჩევად. */
export async function loadInsuranceAdmin() {
  const [companies, services, categories] = await Promise.all([
    prisma.insuranceCompany.findMany({
      include: {
        contracts: {
          include: { service: { select: { name: true } }, category: { select: { name: true } } },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.serviceCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    companies: companies.map(
      (c): CompanyAdminRow => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        contracts: c.contracts.map((k) => ({
          id: k.id,
          target: k.serviceId ? "service" : "category",
          targetId: (k.serviceId ?? k.categoryId)!,
          targetName: k.service?.name ?? `კატეგორია: ${k.category?.name}`,
          coveragePercent: k.coveragePercent.toFixed(2),
          limitAmount: k.limitAmount?.toFixed(2) ?? null,
        })),
      }),
    ),
    services: services.map((s) => ({ id: s.id, label: s.code ? `${s.code} — ${s.name}` : s.name })),
    categories,
  };
}
