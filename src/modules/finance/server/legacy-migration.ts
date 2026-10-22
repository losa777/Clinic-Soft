import type { Prisma } from "@/generated/prisma/client";
import { tbilisiParts } from "@/lib/appointment-slots";
import { fromTetri, invoiceStatus, toTetri } from "@/modules/finance/calc";
import { nextNumber } from "./numbering";

/**
 * ძველი „პაციენტის მიღება“ (visits + visit_services + visit_payments) → ინვოისი + ხაზები + გადახდები.
 * გამოიძახება scripts/setup-db.ts-დან, ტრანზაქციაში, თითო ვიზიტზე. დაზღვევა ძველ ვიზიტებს არ ჰქონდა.
 * გაუქმებული ვიზიტი → გაუქმებული ინვოისი (მისი გადახდები ისტორიაში რჩება, როგორც იყო).
 * ძველი „უნაღდო“ → „ბარათი“; ცვლა ძველ გადახდებს არ აქვს (cash_shift_id = NULL).
 */

type LegacyVisit = {
  id: number;
  patient_id: number;
  doctor_id: number | null;
  doctor_name: string;
  visit_at: Date;
  visit_type: "outpatient" | "day_hospital";
  comment: string | null;
  status: "active" | "cancelled";
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  created_by: number | null;
  created_at: Date;
};

const money = (v: unknown) => toTetri(String(v));
const yearOf = (d: Date) => Number(tbilisiParts(d).date.slice(0, 4));

export async function migrateLegacyVisit(tx: Prisma.TransactionClient, visitId: number) {
  const [visit] = await tx.$queryRaw<LegacyVisit[]>`
    SELECT id, patient_id, doctor_id, doctor_name, visit_at, visit_type, comment, status, cancel_reason,
           cancelled_by, cancelled_at, created_by, created_at
    FROM visits WHERE id = ${visitId}
  `;
  if (!visit) return;
  const services = await tx.$queryRaw<{ service_id: number | null; service_code: string | null; service_name: string; price: unknown }[]>`
    SELECT service_id, service_code, service_name, price FROM visit_services WHERE visit_id = ${visitId} ORDER BY id
  `;
  const payments = await tx.$queryRaw<{ id: number; amount: unknown; method: string; created_by: number | null; created_at: Date }[]>`
    SELECT id, amount, method, created_by, created_at FROM visit_payments WHERE visit_id = ${visitId} ORDER BY created_at, id
  `;

  const total = services.reduce((sum, s) => sum + money(s.price), 0);
  const paid = payments.reduce((sum, p) => sum + money(p.amount), 0);

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: await nextNumber(tx, "INV", yearOf(visit.created_at)),
      patientId: Number(visit.patient_id),
      doctorId: visit.doctor_id === null ? null : Number(visit.doctor_id),
      doctorName: visit.doctor_name,
      serviceDate: visit.visit_at,
      visitType: visit.visit_type,
      status: visit.status === "cancelled" ? "cancelled" : invoiceStatus(total, paid),
      totalAmount: fromTetri(total),
      discountAmount: "0",
      insuranceAmount: "0",
      patientAmount: fromTetri(total),
      comment: visit.comment,
      cancelReason: visit.cancel_reason,
      cancelledById: visit.cancelled_by === null ? null : Number(visit.cancelled_by),
      cancelledAt: visit.cancelled_at,
      createdById: visit.created_by === null ? null : Number(visit.created_by),
      createdAt: visit.created_at,
      legacyVisitId: Number(visit.id),
      items: {
        create: services.map((s) => ({
          serviceId: s.service_id === null ? null : Number(s.service_id),
          serviceCode: s.service_code,
          serviceName: s.service_name,
          quantity: 1,
          unitPrice: fromTetri(money(s.price)),
          discountPercent: "0",
          discountAmount: "0",
          totalAmount: fromTetri(money(s.price)),
          insuranceAmount: "0",
          patientAmount: fromTetri(money(s.price)),
        })),
      },
    },
    select: { id: true },
  });

  for (const p of payments) {
    await tx.payment.create({
      data: {
        receiptNumber: await nextNumber(tx, "RCP", yearOf(p.created_at)),
        invoiceId: invoice.id,
        type: "payment",
        method: p.method === "cashless" ? "card" : "cash",
        amount: fromTetri(money(p.amount)),
        createdById: p.created_by === null ? null : Number(p.created_by),
        createdAt: p.created_at,
        legacyPaymentId: Number(p.id),
      },
    });
  }
}
