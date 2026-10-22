/**
 * ჯავშნების გვერდების მისამართები როლის მიხედვით (ყოველი როლის გვერდი /<როლი>/-შია).
 * ახალი როლის (მაგ. ქოლ ცენტრის) დასამატებლად:
 *   1. როლის კოდი — APPOINTMENT_ROLES-ში (src/lib/roles.ts);
 *   2. ჩანაწერი აქ;
 *   3. ორი გვერდი: src/app/(dashboard)/<როლი>/booking/page.tsx და .../appointments/page.tsx
 *      (იხ. registrar-ის გვერდები — ისინი მხოლოდ BookingScreen-სა და AppointmentsScreen-ს აჩვენებენ).
 */
import { FINANCE_ROUTES, type FinanceRoutes } from "@/modules/finance/routes";

/** finance — ჯავშნიდან ინვოისის შესაქმნელად (null — როლს ინვოისის გვერდები არ აქვს). */
export const APPOINTMENT_ROUTES = {
  registrar: { booking: "/registrar/booking", list: "/registrar/appointments", finance: FINANCE_ROUTES.registrar },
} as const satisfies Record<string, { booking: string; list: string; finance: FinanceRoutes | null }>;

export type AppointmentRoutes = (typeof APPOINTMENT_ROUTES)[keyof typeof APPOINTMENT_ROUTES];
