import { param, periodParams, positiveInt } from "@/modules/finance/params";
import { apiPermission, csvResponse } from "@/modules/finance/server/csv";
import { actionLabel, AUDIT_PRESETS, type AuditPreset, entityLabel } from "@/modules/audit/labels";
import { exportAudit, findAuditPatient } from "@/modules/audit/server";

/** აუდიტის CSV (audit.view): იგივე ფილტრები, რაც გვერდზე. */
export async function GET(request: Request) {
  const denied = await apiPermission("audit.view");
  if (denied) return denied;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const period = periodParams(params, 7);
  const pid = param(params.pid).replace(/\D/g, "");
  const patient = await findAuditPatient({ id: positiveInt(params.patient), personalId: pid || undefined });
  const preset = AUDIT_PRESETS.some((p) => p.value === params.preset) ? (params.preset as AuditPreset) : "";
  const rows = await exportAudit({
    ...period,
    userId: positiveInt(params.user),
    patientId: patient?.id ?? (pid || positiveInt(params.patient) ? -1 : null),
    entity: param(params.entity) || null,
    action: param(params.action) || null,
    preset,
    page: 1,
  });
  return csvResponse(
    `audit-${period.from}-${period.to}.csv`,
    ["დრო", "თანამშრომელი", "როლი", "მოქმედება", "ობიექტი", "ობიექტის №", "პაციენტი", "პირადი №", "დეტალები", "IP"],
    rows.map((r) => [r.at, r.user ?? "უცნობი", r.role, actionLabel(r.action), entityLabel(r.entity), r.entityId, r.patient, r.personalId, r.details, r.ip]),
  );
}
