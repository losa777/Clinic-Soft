import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * აუდიტის ჩანაწერი (audit_log): ვინ, როდის, რომელი პაციენტის ჩანაწერი ნახა/შეცვალა/ხელი მოაწერა.
 * action: view | create | update | deactivate | start | complete | sign | ...; entity: patient | encounter | allergy | ...
 * ტრანზაქციაში გამოძახებისას გადაეცით tx — ცვლილება და აუდიტი ერთად ჩაიწერება ან ერთად გაუქმდება.
 */
export type AuditEntry = {
  userId: number;
  action: string;
  entity: string;
  entityId?: number | null;
  patientId?: number | null;
  details?: string | null;
};

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip"))?.trim().slice(0, 45) || null;
  } catch {
    return null; // მოთხოვნის გარეთ (სკრიპტი)
  }
}

export async function audit(entry: AuditEntry, db: Prisma.TransactionClient = prisma) {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
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
