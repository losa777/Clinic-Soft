/**
 * პაციენტების გვერდების მისამართები როლის მიხედვით. ერთი და იგივე გვერდები (ძებნა, ბარათი)
 * რეგისტრატორთან და ადმინთან სხვადასხვა მისამართზეა, რადგან ყოველი როლის გვერდი /<როლი>/-შია.
 * ახალი პაციენტის რეგისტრაცია მხოლოდ რეგისტრატორს აქვს (newPatient: null).
 * finance — ინვოისების გვერდები (src/modules/finance/routes.ts); null — ამ როლს ინვოისის გვერდები არ აქვს.
 * audit — აუდიტის ჟურნალი (პაციენტის „წვდომის ისტორია“, audit.view უფლებით); null — როლს აუდიტის გვერდი არ აქვს.
 */
import { FINANCE_ROUTES, type FinanceRoutes } from "@/modules/finance/routes";

export const PATIENT_ROUTES = {
  registrar: { search: "/registrar", newPatient: "/registrar/new", patients: "/registrar/patients", finance: FINANCE_ROUTES.registrar, audit: null },
  admin: { search: "/admin/patients", newPatient: null, patients: "/admin/patients", finance: FINANCE_ROUTES.admin, audit: "/admin/audit" },
} as const satisfies Record<string, { search: string; newPatient: string | null; patients: string; finance: FinanceRoutes | null; audit: string | null }>;

/**
 * ახალი პაციენტის რეგისტრაცია მოდალში (მენიუ და ძებნის შედეგი — src/components/patients/new-patient-dialog.tsx).
 * false — ძველებურად, ცალკე გვერდზე (/registrar/new). გვერდი ორივე შემთხვევაში არსებობს.
 */
export const REGISTER_IN_DIALOG = true;

export type PatientRoutes =(typeof PATIENT_ROUTES)[keyof typeof PATIENT_ROUTES];

export const patientUrl = (routes: PatientRoutes, id: number) => `${routes.patients}/${id}`;
