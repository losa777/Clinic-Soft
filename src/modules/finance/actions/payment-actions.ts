"use server";

import { z } from "zod";
import { type ActionFailure, failure, invalid } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { fromTetri } from "@/modules/finance/calc";
import { type PaymentInput, paymentSchema, type RefundInput, refundSchema } from "@/modules/finance/schema";
import { FINANCE_TX, financeFailure } from "@/modules/finance/server/errors";
import { acceptPayment, refundPayment } from "@/modules/finance/server/payments";

export type PaymentResult = { ok: true; message: string; paymentId: number } | ActionFailure;

/** გადახდის მიღება (payments.create): ნაღდი — ღია ცვლით, ხურდის გამოთვლით; ბარათი — ტრანზაქციის ნომრით. */
export async function acceptPaymentAction(input: PaymentInput): Promise<PaymentResult> {
  const me = await requirePermission("payments.create");
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const payment = await prisma.$transaction((tx) => acceptPayment(tx, parsed.data, Number(me.id)), FINANCE_TX);
    const change = payment.change ? `, ხურდა: ${fromTetri(payment.change)} ₾` : "";
    return { ok: true, message: `გადახდა მიღებულია (ქვითარი ${payment.receiptNumber})${change}`, paymentId: payment.id };
  } catch (error) {
    return financeFailure(error);
  }
}

/** თანხის დაბრუნება მიზეზით (payments.refund) — ახალი ჩანაწერი, ძველი გადახდა არ იცვლება. */
export async function refundAction(input: RefundInput): Promise<PaymentResult> {
  const me = await requirePermission("payments.refund");
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const p = await refundPayment(tx, parsed.data, Number(me.id));
      const r = await tx.payment.findUniqueOrThrow({
        where: { id: p.id },
        select: { amount: true, method: true, reason: true, invoice: { select: { id: true, invoiceNumber: true, patientId: true } } },
      });
      await audit(
        {
          userId: Number(me.id),
          action: "refund",
          entity: "invoice",
          entityId: r.invoice.id,
          patientId: r.invoice.patientId,
          details: `${r.invoice.invoiceNumber} · ${r.amount.toFixed(2)} ₾ (${r.method === "cash" ? "ნაღდი" : "ბარათი"}) · ${r.reason ?? ""}`,
        },
        tx,
      );
      return p;
    }, FINANCE_TX);
    return { ok: true, message: `თანხა დაბრუნდა (ქვითარი ${payment.receiptNumber})`, paymentId: payment.id };
  } catch (error) {
    return financeFailure(error);
  }
}

const printSchema = z.object({ paymentId: z.number().int().positive(), format: z.enum(["thermal", "a4"]) });

/** ქვითრის ბეჭდვის აღრიცხვა (პირველის შემდეგ ყველა — „დუბლიკატი“). */
export async function recordReceiptPrint(input: z.input<typeof printSchema>): Promise<{ ok: true } | ActionFailure> {
  const me = await requirePermission("payments.create");
  const parsed = printSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const exists = await prisma.payment.count({ where: { id: parsed.data.paymentId } });
  if (!exists) return failure("ქვითარი ვერ მოიძებნა");
  await prisma.receiptPrint.create({
    data: { paymentId: parsed.data.paymentId, format: parsed.data.format, printedById: Number(me.id), printedAt: new Date() },
  });
  return { ok: true };
}
