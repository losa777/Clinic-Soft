/**
 * პაციენტების გვერდების მისამართები როლის მიხედვით. ერთი და იგივე გვერდები (ძებნა, ბარათი)
 * რეგისტრატორთან და ადმინთან სხვადასხვა მისამართზეა, რადგან ყოველი როლის გვერდი /<როლი>/-შია.
 * ახალი პაციენტის რეგისტრაცია მხოლოდ რეგისტრატორს აქვს (newPatient: null).
 * finance — ინვოისების გვერდები (src/modules/finance/routes.ts); null — ამ როლს ინვოისის გვერდები არ აქვს.
 */
import { FINANCE_ROUTES, type FinanceRoutes } from "@/modules/finance/routes";

export const PATIENT_ROUTES = {
  registrar: { search: "/registrar", newPatient: "/registrar/new", patients: "/registrar/patients", finance: FINANCE_ROUTES.registrar },
  admin: { search: "/admin/patients", newPatient: null, patients: "/admin/patients", finance: FINANCE_ROUTES.admin },
} as const satisfies Record<string, { search: string; newPatient: string | null; patients: string; finance: FinanceRoutes | null }>;

export type PatientRoutes = (typeof PATIENT_ROUTES)[keyof typeof PATIENT_ROUTES];

export const patientUrl = (routes: PatientRoutes, id: number) => `${routes.patients}/${id}`;
