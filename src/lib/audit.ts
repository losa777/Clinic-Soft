import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * აუდიტის ჩანაწერი (audit_log): ვინ, როდის, რა ნახა/შეცვალა. მხოლოდ ემატება — არ იცვლება და არ იშლება.
 * action: view | create | update | delete | login | ...; entity: patient | encounter | user | role | invoice | ...
 * (ქართული წარწერები — src/modules/audit/labels.ts). ტრანზაქციაში გადაეცით tx — ცვლილება და აუდიტი ერთად
 * ჩაიწერება ან ერთად გაუქმდება. userId null — უცნობი მომხმარებელი (მაგ. შესვლის მცდელობა არარსებული სახელით).
 */
export type AuditEntry = {
  userId: number | null;
  /** რომელი როლით (რამდენიმე როლის მომხმარებელი); გამოტოვებული — მიმდინარე სესიის როლი */
  roleCode?: string | null;
  action: string;
  entity: string;
  entityId?: number | null;
  patientId?: number | null;
  details?: string | null;
};

type Db = Prisma.TransactionClient;

/** მომხმარებლის IP (reverse proxy-ის X-Forwarded-For ან Next-ის custom server-ის მიერ დასმული). */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip"))?.trim().slice(0, 45) || null;
  } catch {
    return null; // მოთხოვნის გარეთ (სკრიპტი, ტაიმერი)
  }
}

/** მოქმედების შემსრულებლის როლი: ამ მოთხოვნის განყოფილება (requireRole) ან სესიის აქტიური როლი. */
async function actingRole(userId: number | null): Promise<string | null> {
  if (userId === null) return null;
  try {
    // dal → auth → audit: ციკლური იმპორტის თავიდან ასაცილებლად — გამოძახებისას
    const { getSession, requestRole } = await import("@/lib/dal");
    const session = await getSession();
    if (session?.user?.id !== String(userId)) return null;
    return requestRole().code ?? session.user.roleCode;
  } catch {
    return null; // მოთხოვნის გარეთ (სკრიპტი, ტაიმერი)
  }
}

export async function audit(entry: AuditEntry, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      roleCode: entry.roleCode !== undefined ? entry.roleCode : await actingRole(entry.userId),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      patientId: entry.patientId ?? null,
      details: entry.details?.slice(0, 500) ?? null,
      ip: await clientIp(),
      createdAt: new Date(),
    },
  });
}

/**
 * ნახვის ჩანაწერი განმეორების გარეშე: იგივე მომხმარებელი, იგივე ობიექტი, withinMs-ში — ერთხელ
 * (გვერდის განახლება, სურათის ხელახლა ჩატვირთვა ჟურნალს არ ავსებს).
 */
export async function auditOnce(entry: AuditEntry & { userId: number }, withinMs = 10 * 60 * 1000) {
  const recent = await prisma.auditLog.count({
    where: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      createdAt: { gte: new Date(Date.now() - withinMs) },
    },
  });
  if (!recent) await audit(entry);
}

/** პაციენტის ბარათის ნახვა (რეგისტრატურა/ადმინი) — მხოლოდ არსებულ პაციენტზე (patient_id FK). */
export async function auditPatientView(userId: number, rawId: string, details: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0 || !(await prisma.patient.count({ where: { id } }))) return;
  await auditOnce({ userId, action: "view", entity: "patient", entityId: id, patientId: id, details });
}
