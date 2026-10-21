/**
 * პაციენტების გვერდების მისამართები როლის მიხედვით. ერთი და იგივე გვერდები (ძებნა, ბარათი, ვიზიტები)
 * რეგისტრატორთან და ადმინთან სხვადასხვა მისამართზეა, რადგან ყოველი როლის გვერდი /<როლი>/-შია.
 * ახალი პაციენტის რეგისტრაცია და მიღება მხოლოდ რეგისტრატორს აქვს (newPatient: null, reception: false).
 */
export const PATIENT_ROUTES = {
  registrar: { search: "/registrar", newPatient: "/registrar/new", patients: "/registrar/patients", reception: true },
  admin: { search: "/admin/patients", newPatient: null, patients: "/admin/patients", reception: false },
} as const;

export type PatientRoutes = (typeof PATIENT_ROUTES)[keyof typeof PATIENT_ROUTES];

export const patientUrl = (routes: PatientRoutes, id: number) => `${routes.patients}/${id}`;

/** მიღების გვერდი; null — ამ როლს მიღება არ აქვს. */
export const newVisitUrl = (routes: PatientRoutes, id: number) =>
  routes.reception ? `${routes.patients}/${id}/visits/new` : null;

/** ვიზიტის რედაქტირების მისამართის თარგი: `{visitId}` ჩაისმება ვიზიტების სიაში. */
export const editVisitUrlTemplate = (routes: PatientRoutes, id: number) => `${routes.patients}/${id}/visits/{visitId}/edit`;
