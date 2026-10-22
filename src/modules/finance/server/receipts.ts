import "server-only";
import { prisma } from "@/lib/db";
import { fromTetri, invoiceDebt, netPaid } from "@/modules/finance/calc";
import { type ClinicSettings, DEFAULT_SETTINGS, SETTING_KEYS } from "@/modules/finance/settings";
import type { ReceiptData } from "@/modules/finance/types";
import { formatDateTime, fullName, tetri } from "./db";

export async function loadSettings(): Promise<ClinicSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, values[k] ?? DEFAULT_SETTINGS[k]])) as ClinicSettings;
}

/**
 * ქვითარი გადახდაზე/დაბრუნებაზე. ნარჩენი ვალი — ამ ოპერაციის მომენტისთვის (მასზე ადრინდელი და თვითონ ეს ოპერაცია).
 */
export async function loadReceipt(paymentId: number): Promise<ReceiptData | null> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      invoice: {
        include: {
          patient: { select: { firstName: true, lastName: true, personalId: true } },
          insuranceCompany: { select: { name: true } },
          items: { orderBy: { id: "asc" } },
          payments: { where: { id: { lte: paymentId } }, select: { type: true, amount: true } },
        },
      },
      _count: { select: { prints: true } },
    },
  });
  if (!p) return null;
  const settings = await loadSettings();
  const i = p.invoice;
  const paidSoFar = netPaid(i.payments.map((x) => ({ type: x.type, amount: tetri(x.amount) })));

  return {
    clinic: {
      name: settings.clinic_name,
      legalName: settings.clinic_legal_name,
      taxId: settings.clinic_tax_id,
      address: settings.clinic_address,
      phone: settings.clinic_phone,
      footer: settings.receipt_footer,
    },
    receiptNumber: p.receiptNumber,
    type: p.type,
    createdAt: formatDateTime(p.createdAt),
    cashier: fullName(p.createdBy),
    invoiceNumber: i.invoiceNumber,
    patient: { name: fullName(i.patient)!, personalId: i.patient.personalId },
    items: i.items.map((it) => ({
      name: it.serviceName,
      quantity: it.quantity,
      total: it.totalAmount.toFixed(2),
      insurance: it.insuranceAmount.toFixed(2),
      patient: it.patientAmount.toFixed(2),
    })),
    totals: { total: i.totalAmount.toFixed(2), insurance: i.insuranceAmount.toFixed(2), patient: i.patientAmount.toFixed(2) },
    insurance: i.insuranceCompany ? `${i.insuranceCompany.name}${i.policyNumber ? `, პოლისი ${i.policyNumber}` : ""}` : null,
    amount: p.amount.toFixed(2),
    method: p.method,
    receivedAmount: p.receivedAmount?.toFixed(2) ?? null,
    changeAmount: p.changeAmount?.toFixed(2) ?? null,
    cardReference: p.cardReference,
    reason: p.reason,
    remainingDebt: fromTetri(invoiceDebt(tetri(i.patientAmount), paidSoFar)),
    printCount: p._count.prints,
  };
}
