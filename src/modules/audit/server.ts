import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { addDays, tbilisiToDate } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { formatDateTime, fullName } from "@/modules/finance/server/db";
import type { AuditPreset } from "./labels";

/**
 * აუდიტის ჟურნალის ძებნა: პერიოდი (თბილისის დღეები), თანამშრომელი, პაციენტი, ობიექტი, მოქმედება / ჯგუფი.
 * ინდექსები: (created_at), (user_id, created_at), (patient_id, created_at). ახალი პირველი.
 */

export const AUDIT_PAGE_SIZE = 50;
const EXPORT_LIMIT = 50_000;

export type AuditFilter = {
  from: string;
  to: string;
  userId: number | null;
  patientId: number | null;
  entity: string | null;
  action: string | null;
  preset: AuditPreset;
  page: number;
};

export type AuditRow = {
  id: string;
  at: string;
  user: string | null;
  role: string | null;
  userId: number | null;
  action: string;
  entity: string;
  entityId: number | null;
  patientId: number | null;
  patient: string | null;
  personalId: string | null;
  details: string | null;
  ip: string | null;
};

/** წარუმატებელი შესვლა, ბლოკი, არასწორი ამჟამინდელი პაროლი (პაროლის შეცვლისას). */
const FAILED_ACTIONS = ["login_failed", "login_blocked", "password_failed"];

const PRESET_WHERE: Record<Exclude<AuditPreset, "">, Prisma.AuditLogWhereInput> = {
  patient_access: { action: "view", patientId: { not: null } },
  changes: {
    action: { in: ["create", "update", "edit", "delete", "upload", "cancel", "refund", "deactivate", "new_version", "permissions", "purge", "password_change", "unlock"] },
  },
  security: { entity: { in: ["session", "user", "role"] } },
  failed_logins: { action: { in: FAILED_ACTIONS } },
};

function where(f: AuditFilter): Prisma.AuditLogWhereInput {
  return {
    createdAt: { gte: tbilisiToDate(f.from, 0), lt: tbilisiToDate(addDays(f.to, 1), 0) },
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.patientId ? { patientId: f.patientId } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.preset ? PRESET_WHERE[f.preset] : {}),
  };
}

const include = {
  user: { select: { firstName: true, lastName: true, role: { select: { name: true } } } },
  patient: { select: { firstName: true, lastName: true, personalId: true } },
} satisfies Prisma.AuditLogInclude;

/** როლის კოდი → სახელი: ჩანაწერში ის როლი ჩანს, რომლითაც მოქმედება შესრულდა (ძველ ჩანაწერებში — მთავარი როლი). */
async function roleNames(): Promise<Map<string, string>> {
  return new Map((await prisma.role.findMany({ select: { code: true, name: true } })).map((r) => [r.code, r.name]));
}

function toRow(r: Prisma.AuditLogGetPayload<{ include: typeof include }>, roles: Map<string, string>): AuditRow {
  return {
    id: String(r.id),
    at: formatDateTime(r.createdAt),
    user: fullName(r.user),
    role: (r.roleCode && roles.get(r.roleCode)) ?? r.user?.role.name ?? null,
    userId: r.userId,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    patientId: r.patientId,
    patient: fullName(r.patient),
    personalId: r.patient?.personalId ?? null,
    details: r.details,
    ip: r.ip,
  };
}

export async function listAudit(f: AuditFilter) {
  const w = where(f);
  const count = await prisma.auditLog.count({ where: w });
  const pageCount = Math.max(1, Math.ceil(count / AUDIT_PAGE_SIZE));
  const page = Math.min(f.page, pageCount);
  const [rows, roles] = await Promise.all([
    prisma.auditLog.findMany({ where: w, include, orderBy: { id: "desc" }, skip: (page - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE }),
    roleNames(),
  ]);
  return { rows: rows.map((r) => toRow(r, roles)), count, page, pageCount };
}

export async function exportAudit(f: AuditFilter) {
  const [rows, roles] = await Promise.all([prisma.auditLog.findMany({ where: where(f), include, orderBy: { id: "desc" }, take: EXPORT_LIMIT }), roleNames()]);
  return rows.map((r) => toRow(r, roles));
}

/** ფილტრებისთვის: თანამშრომლები (გათიშულიც — ძველ ჩანაწერებში ჩანან), ჟურნალში არსებული ობიექტები და მოქმედებები. */
export async function loadAuditOptions() {
  const [users, entities, actions] = await Promise.all([
    prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, isActive: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.$queryRaw<{ entity: string }[]>`SELECT DISTINCT entity FROM audit_log`,
    prisma.$queryRaw<{ action: string }[]>`SELECT DISTINCT action FROM audit_log`,
  ]);
  return {
    users: users.map((u) => ({ id: u.id, name: `${fullName(u)}${u.isActive ? "" : " (გათიშული)"}` })),
    entities: entities.map((e) => e.entity),
    actions: actions.map((a) => a.action),
  };
}

/** პაციენტი ფილტრისთვის: პირადი ნომრით (ზუსტი) ან id-ით (ბმულიდან). */
export async function findAuditPatient(query: { id?: number | null; personalId?: string }) {
  if (query.id) return prisma.patient.findUnique({ where: { id: query.id }, select: { id: true, firstName: true, lastName: true, personalId: true } });
  if (query.personalId) return prisma.patient.findFirst({ where: { personalId: query.personalId }, select: { id: true, firstName: true, lastName: true, personalId: true } });
  return null;
}

/** მოკლე სტატისტიკა პერიოდზე: ჩანაწერები, წარუმატებელი შესვლები, პაციენტის ბარათის ნახვები. */
export async function auditSummary(from: string, to: string) {
  const createdAt = { gte: tbilisiToDate(from, 0), lt: tbilisiToDate(addDays(to, 1), 0) };
  const [total, failedLogins, patientViews, patients] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt } }),
    prisma.auditLog.count({ where: { createdAt, action: { in: FAILED_ACTIONS } } }),
    prisma.auditLog.count({ where: { createdAt, action: "view", patientId: { not: null } } }),
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT patient_id) AS n FROM audit_log WHERE created_at >= ${createdAt.gte} AND created_at < ${createdAt.lt} AND patient_id IS NOT NULL`,
  ]);
  return { total, failedLogins, patientViews, patients: Number(patients[0]?.n ?? 0) };
}
