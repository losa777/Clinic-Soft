"use server";

import { z } from "zod";
import { type ActionResult, invalid, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { audit } from "@/modules/emr/server/audit";
import { loadCompletionPreview } from "@/modules/emr/server/completion";
import { EMR_TX, EmrError, emrFailure } from "@/modules/emr/server/errors";
import { FinanceError } from "@/modules/finance/server/errors";
import { createInvoice } from "@/modules/finance/server/invoices";

const completeSchema = z.object({ encounterId: z.number().int().positive(), version: z.number().int().positive() });

/**
 * ვიზიტის დასრულება (ერთ ტრანზაქციაში): შემოწმება (საკუთარი, დაუსრულებელი, ბოლო შენახული ვერსია, ძირითადი დიაგნოზი) →
 * ინვოისი (ფასები და დაზღვევა — ფინანსების მოდულით, ექიმი ფასს ვერ ცვლის) → დანიშნულებები მოინიშნება დარიცხულად →
 * ჩანაწერი იკეტება, ჯავშანი — „დასრულებული“. რომელიმე ნაბიჯის ჩავარდნისას არაფერი იცვლება.
 */
export async function completeEncounterAction(input: { encounterId: number; version: number }): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { encounterId, version } = parsed.data;
  const userId = Number(me.id);

  try {
    const message = await prisma.$transaction(async (tx) => {
      // ჩაკეტვა: ერთდროულად ავტოშენახვა/მეორე ფანჯრიდან დასრულება ვერ მოხდება
      await tx.$queryRaw`SELECT id FROM encounters WHERE id = ${encounterId} FOR UPDATE`;
      const e = await tx.encounter.findUnique({
        where: { id: encounterId },
        select: {
          doctorId: true,
          status: true,
          version: true,
          patientId: true,
          appointmentId: true,
          startedAt: true,
          appointment: { select: { status: true } },
        },
      });
      if (!e) throw new EmrError("ვიზიტის ჩანაწერი ვერ მოიძებნა");
      if (e.doctorId !== userId) throw new EmrError("ვიზიტს ასრულებს მხოლოდ მისი ექიმი");
      if (e.status !== "draft") throw new EmrError("ვიზიტი უკვე დასრულებულია");
      if (e.version !== version) throw new EmrError("ჩანაწერი შეიცვალა (სხვა ფანჯარა?) — განაახლეთ გვერდი და სცადეთ თავიდან");
      if (e.appointment.status !== "in_progress") throw new EmrError("ჯავშანი „მიღებაზე“ სტატუსში არ არის");

      const billing = await loadCompletionPreview(tx, encounterId);
      if (!billing) throw new EmrError("ვიზიტის ჩანაწერი ვერ მოიძებნა");
      if (!billing.hasPrimaryDiagnosis) throw new EmrError("მიუთითეთ ძირითადი დიაგნოზი (ICD-10)", { diagnoses: "სავალდებულოა" });

      let invoice: { id: number; number: string } | null = null;
      if (billing.lines.length) {
        invoice = await createInvoice(
          tx,
          {
            patientId: e.patientId,
            // ჯავშანს ინვოისი უკვე აქვს → დამატებითი ინვოისი ჯავშანზე მიბმის გარეშე (ექიმი — ხელით), რიგი არ იქმნება
            appointmentId: billing.existingInvoice ? null : e.appointmentId,
            doctorId: billing.existingInvoice ? userId : null,
            visitType: "outpatient",
            serviceDate: e.startedAt.toISOString(),
            items: billing.lines.map((l) => ({ serviceId: l.serviceId, quantity: l.quantity, discountPercent: "0" })),
            disableInsurance: false,
            disableInsuranceReason: null,
            comment: billing.existingInvoice
              ? `დანიშნულებები (ვიზიტი, ჯავშანი #${e.appointmentId}; ძირითადი ინვოისი ${billing.existingInvoice}) — ავტომატურად`
              : `ვიზიტის დასრულებისას — ავტომატურად`,
          },
          userId,
          { queueWalkIn: false },
        );
        if (billing.orderIds.length) {
          await tx.medicalOrder.updateMany({ where: { id: { in: billing.orderIds }, invoiceId: null }, data: { invoiceId: invoice.id } });
        }
      }

      const now = new Date();
      await tx.encounter.update({
        where: { id: encounterId },
        data: { status: "completed", completedAt: now, updatedAt: now, version: { increment: 1 } },
      });
      await tx.appointment.update({ where: { id: e.appointmentId }, data: { status: "completed", updatedById: userId } });
      await audit(
        {
          userId,
          action: "complete",
          entity: "encounter",
          entityId: encounterId,
          patientId: e.patientId,
          details: [
            invoice ? `ინვოისი ${invoice.number} (${billing.lines.length} ხაზი)` : "ინვოისი არ შეიქმნა — დასარიცხი არაფერია",
            billing.skipped.length && `გამოტოვებული (გათიშული სერვისი): ${billing.skipped.join(", ")}`,
          ]
            .filter(Boolean)
            .join("; "),
        },
        tx,
      );

      const parts = ["ვიზიტი დასრულდა"];
      if (invoice) parts.push(`ინვოისი ${invoice.number}`);
      if (billing.skipped.length) parts.push(`ვერ დაირიცხა (სერვისი გათიშულია): ${billing.skipped.join(", ")}`);
      return parts.join(" · ");
    }, EMR_TX);
    return success(message);
  } catch (error) {
    if (error instanceof FinanceError) return emrFailure(new EmrError(`ინვოისი ვერ შეიქმნა: ${error.message}`));
    return emrFailure(error);
  }
}
