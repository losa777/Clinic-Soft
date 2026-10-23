/**
 * ფინანსების გვერდების მისამართები როლის მიხედვით (ყოველი როლის გვერდი /<როლი>/-შია, proxy.ts).
 * null — ამ როლს ეს გვერდი არ აქვს (მაგ. ბუღალტერს სალარო). ღილაკები უფლებებითაც იმალება (can()).
 * ახალი როლისთვის: ჩანაწერი აქ + გვერდები src/app/(dashboard)/<როლი>/ (ნიმუში — accountant).
 */
export type FinanceRoutes = {
  invoices: string;
  cash: string | null;
  debts: string;
  reports: string;
  receipts: string | null;
  /** პაციენტის ბარათი (ინვოისიდან გადასასვლელად); null — როლს პაციენტის გვერდი არ აქვს */
  patients: string | null;
};

export const FINANCE_ROUTES = {
  registrar: {
    invoices: "/registrar/invoices",
    cash: "/registrar/cash",
    debts: "/registrar/debts",
    reports: "/registrar/reports",
    receipts: "/registrar/receipts",
    patients: "/registrar/patients",
  },
  accountant: {
    invoices: "/accountant/invoices",
    cash: null,
    debts: "/accountant/debts",
    reports: "/accountant",
    receipts: null,
    patients: null,
  },
  // ადმინს ყველა უფლება აქვს: ინვოისები (გადახდა, დაბრუნება, გაუქმება), სალარო, ანგარიშები
  admin: {
    invoices: "/admin/invoices",
    cash: "/admin/cash",
    debts: "/admin/debts",
    reports: "/admin/reports",
    receipts: "/admin/receipts",
    patients: "/admin/patients",
  },
  director: {
    invoices: "/director/invoices",
    cash: null,
    debts: "/director/debts",
    reports: "/director",
    receipts: null,
    patients: null,
  },
} satisfies Record<string, FinanceRoutes>;

export const invoiceUrl = (routes: FinanceRoutes, id: number) => `${routes.invoices}/${id}`;

export function newInvoiceUrl(routes: FinanceRoutes, params: { patientId?: number; appointmentId?: number }): string {
  const qs = new URLSearchParams();
  if (params.appointmentId) qs.set("appointmentId", String(params.appointmentId));
  else if (params.patientId) qs.set("patientId", String(params.patientId));
  return `${routes.invoices}/new?${qs}`;
}

export const receiptUrl = (routes: FinanceRoutes, paymentId: number) => (routes.receipts ? `${routes.receipts}/${paymentId}` : null);
