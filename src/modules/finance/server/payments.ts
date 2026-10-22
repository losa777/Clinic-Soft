import "server-only";
import type { z } from "zod";
import { cashChange, checkPayment, checkRefund, invoiceDebt, toTetri } from "@/modules/finance/calc";
import type { paymentSchema, refundSchema } from "@/modules/finance/schema";
import { currentYear, type Db, dec } from "./db";
import { FinanceError } from "./errors";
import { lockInvoice, refreshInvoiceStatus } from "./invoices";
import { nextNumber } from "./numbering";

/**
 * გადახდა და დაბრუნება — ერთ ტრანზაქციაში: ინვოისის ჩაკეტვა → შემოწმება → ჩანაწერი ქვითრის ნომრით → სტატუსი.
 * ჩანაწერი შემდეგ აღარ იცვლება და არ იშლება. ნაღდი ოპერაცია — მხოლოდ მოლარის ღია ცვლით.
 */

async function openShiftOf(tx: Db, userId: number) {
  // ცვლის ჩაკეტვა: ამასობაში არ დაიხურება (დახურვაც ამავე სტრიქონს კეტავს)
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM cash_shifts WHERE user_id = ${userId} AND status = 'open' FOR UPDATE
  `;
  return rows.length ? Number(rows[0].id) : null;
}

export async function acceptPayment(tx: Db, input: z.output<typeof paymentSchema>, userId: number) {
  const { invoice, patientAmount, paid } = await lockInvoice(tx, input.invoiceId);
  if (invoice.status === "cancelled") throw new FinanceError("ინვოისი გაუქმებულია");

  const amount = toTetri(input.amount);
  const error = checkPayment(invoiceDebt(patientAmount, paid), amount);
  if (error) throw new FinanceError(error, { amount: error });

  const shiftId = await openShiftOf(tx, userId);
  let received: number | null = null;
  let change: number | null = null;
  if (input.method === "cash") {
    if (!shiftId) throw new FinanceError("ნაღდი გადახდის მისაღებად ჯერ გახსენით სალაროს ცვლა („სალარო“)");
    received = input.receivedAmount ? toTetri(input.receivedAmount) : amount;
    const result = cashChange(amount, received);
    if (!result.ok) throw new FinanceError(result.error, { receivedAmount: result.error });
    change = result.change;
  }

  const payment = await tx.payment.create({
    data: {
      receiptNumber: await nextNumber(tx, "RCP", currentYear()),
      invoiceId: invoice.id,
      type: "payment",
      method: input.method,
      amount: dec(amount),
      receivedAmount: received === null ? null : dec(received),
      changeAmount: change === null ? null : dec(change),
      cardReference: input.method === "card" ? input.cardReference : null,
      // ბარათით გადახდაც ცვლას მიეწერება, თუ ღიაა (მოლარის ანგარიშისთვის)
      cashShiftId: shiftId,
      createdById: userId,
      createdAt: new Date(),
    },
    select: { id: true, receiptNumber: true },
  });
  await refreshInvoiceStatus(tx, invoice.id, patientAmount, paid + amount);
  return { ...payment, change };
}

export async function refundPayment(tx: Db, input: z.output<typeof refundSchema>, userId: number) {
  const { invoice, patientAmount, paid, paidByMethod } = await lockInvoice(tx, input.invoiceId);
  if (invoice.status === "cancelled") throw new FinanceError("ინვოისი გაუქმებულია");

  const amount = toTetri(input.amount);
  const error = checkRefund(amount, paid, paidByMethod[input.method]);
  if (error) throw new FinanceError(error, { amount: error });

  const shiftId = await openShiftOf(tx, userId);
  if (input.method === "cash" && !shiftId) throw new FinanceError("ნაღდით დასაბრუნებლად ჯერ გახსენით სალაროს ცვლა");

  const payment = await tx.payment.create({
    data: {
      receiptNumber: await nextNumber(tx, "RCP", currentYear()),
      invoiceId: invoice.id,
      type: "refund",
      method: input.method,
      amount: dec(amount),
      cardReference: input.method === "card" ? input.cardReference : null,
      reason: input.reason,
      cashShiftId: shiftId,
      createdById: userId,
      createdAt: new Date(),
    },
    select: { id: true, receiptNumber: true },
  });
  await refreshInvoiceStatus(tx, invoice.id, patientAmount, paid - amount);
  return payment;
}
