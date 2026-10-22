/**
 * ჯავშნების გვერდების მისამართები როლის მიხედვით (ყოველი როლის გვერდი /<როლი>/-შია).
 * ახალი როლის (მაგ. ქოლ ცენტრის) დასამატებლად:
 *   1. როლს — უფლებები appointments.book (დაჯავშნა) და/ან appointments.manage (ადმინის „უფლებები“ გვერდზე);
 *   2. ჩანაწერი აქ;
 *   3. ორი გვერდი: src/app/(dashboard)/<როლი>/booking/page.tsx და .../appointments/page.tsx
 *      (იხ. registrar-ის გვერდები — ისინი მხოლოდ BookingScreen-სა და AppointmentsScreen-ს აჩვენებენ).
 */
import { FINANCE_ROUTES, type FinanceRoutes } from "@/modules/finance/routes";

/** finance — ჯავშნიდან ინვოისის შესაქმნელად (null — როლს ინვოისის გვერდები არ აქვს). */
export const APPOINTMENT_ROUTES = {
  registrar: { booking: "/registrar/booking", list: "/registrar/appointments", finance: FINANCE_ROUTES.registrar },
  // ექიმი: მიმართვა / განმეორებითი ვიზიტი პაციენტის ბარათიდან; სია — ექიმის დღის განრიგი
  doctor: { booking: "/doctor/booking", list: "/doctor", finance: null },
} as const satisfies Record<string, { booking: string; list: string; finance: FinanceRoutes | null }>;

export type AppointmentRoutes = (typeof APPOINTMENT_ROUTES)[keyof typeof APPOINTMENT_ROUTES];
