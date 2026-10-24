"use server";

import { type ActionFailure, type ActionResult, invalid, success } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { emitLive } from "@/lib/live";
import { type CancelInvoiceInput, cancelInvoiceSchema, type InvoiceInput, invoiceSchema } from "@/modules/finance/schema";
import { FINANCE_TX, financeFailure } from "@/modules/finance/server/errors";
import { cancelInvoice, createInvoice } from "@/modules/finance/server/invoices";

export type InvoiceCreateResult = { ok: true; message: string; invoiceId: number } | ActionFailure;

/** ინვოისის შექმნა (invoices.create): ფასები და დაზღვევის წილი სერვერზე ითვლება, ერთ ტრანზაქციაში ნომერთან ერთად. */
export async function createInvoiceAction(input: InvoiceInput): Promise<InvoiceCreateResult> {
  const me = await requirePermission("invoices.create");
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const invoice = await prisma.$transaction((tx) => createInvoice(tx, parsed.data, Number(me.id)), FINANCE_TX);
    // ინვოისი ექიმით: „მობრძანდა“ / ცოცხალი რიგი — ექიმის მომლოდინეები
    emitLive(["invoices", "appointments"], [parsed.data.doctorId]);
    return { ok: true, message: `ინვოისი შეიქმნა: ${invoice.number}`, invoiceId: invoice.id };
  } catch (error) {
    return financeFailure(error);
  }
}

/** ინვოისის გაუქმება მიზეზით (invoices.cancel). ჩანაწერი რჩება; გადახდილი ინვოისი ჯერ დაბრუნებას საჭიროებს. */
export async function cancelInvoiceAction(input: CancelInvoiceInput): Promise<ActionResult> {
  const me = await requirePermission("invoices.cancel");
  const parsed = cancelInvoiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const number = await prisma.$transaction(
      async (tx) => {
        const number = await cancelInvoice(tx, parsed.data.invoiceId, parsed.data.reason, Number(me.id));
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: parsed.data.invoiceId }, select: { patientId: true, totalAmount: true } });
        await audit(
          { userId: Number(me.id), action: "cancel", entity: "invoice", entityId: parsed.data.invoiceId, patientId: inv.patientId, details: `${number} · ${inv.totalAmount.toFixed(2)} ₾ · ${parsed.data.reason}` },
          tx,
        );
        return number;
      },
      FINANCE_TX,
    );
    emitLive(["invoices", "appointments"]);
    return success(`ინვოისი ${number} გაუქმდა`);
  } catch (error) {
    return financeFailure(error);
  }
}
