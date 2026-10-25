import "server-only";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * ანგარიშგების წვდომა: reporting.view — საოპერაციო პაციენტების ჩანაწერი (ნაგულისხმევი), reporting.all_patients —
 * ყველა პაციენტი. პაციენტი „საოპერაციოა“, თუ ერთი ვიზიტი მაინც მონიშნულია (ისტორია — მთლიანად ჩანს).
 */
type User = Session["user"];

export const seesReporting = (user: User) => can(user, "reporting.view");
export const seesAllPatients = (user: User) => can(user, "reporting.view") && can(user, "reporting.all_patients");

export async function isSurgicalPatient(patientId: number): Promise<boolean> {
  return (await prisma.encounter.count({ where: { patientId, isSurgical: true } })) > 0;
}

/** ანგარიშგების მომხმარებელს ეს პაციენტი ჩანს (API მარშრუტებიდანაც — ფაილები, ფორმა 100). */
export async function reportingSeesPatient(user: User, patientId: number): Promise<boolean> {
  if (!seesReporting(user)) return false;
  return seesAllPatients(user) || isSurgicalPatient(patientId);
}
