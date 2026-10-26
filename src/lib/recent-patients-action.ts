"use server";

import { requireUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { type PatientSearchRow, recentPatients } from "@/lib/patient-records";
import { PATIENT_ROLES } from "@/lib/roles";

/**
 * ძებნის ველზე დაჭერისას ჩამოსაშლელი სია (ბოლო 50): ექიმს — ბოლოს ნანახი საკუთარი პაციენტები,
 * რეგისტრატურას/ადმინს და ჯავშნის უფლების მქონეს — ბოლოს დარეგისტრირებულები. სხვას — ცარიელი.
 */
export async function recentPatientsAction(): Promise<PatientSearchRow[]> {
  const me = await requireUser();
  const registry = (PATIENT_ROLES as string[]).includes(me.roleCode);
  let result;
  if (!registry && can(me, "emr.view")) result = await recentPatients({ doctorUserId: Number(me.id) });
  else if (registry || can(me, "appointments.book")) result = await recentPatients();
  else return [];
  return result.status === "recent" ? result.rows : [];
}
