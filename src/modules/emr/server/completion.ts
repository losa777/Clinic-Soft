import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { FinanceError } from "@/modules/finance/server/errors";
import { createInvoice } from "@/modules/finance/server/invoices";
import { EmrError } from "./errors";
import { missingRequiredMeasurements } from "./measurements";

type Db = Prisma.TransactionClient;

export type BillingLine = { serviceId: number; name: string; quantity: number; price: string };

export type CompletionPreview = {
  /** ჯავშნის უკვე არსებული (გაუქმებელი) ინვოისი — მაშინ კონსულტაცია აღარ ემატება, დანიშნულებები — ცალკე ინვოისით */
  existingInvoice: string | null;
  /** რა ჩაჯდება ინვოისში (ფასები — ფასების ცხრილიდან, დაზღვევა ინვოისში ავტომატურად გამოითვლება) */
  lines: BillingLine[];
  /** დანიშნულებები, რომლებიც ვერ ჩაჯდება (სერვისი გათიშულია) — რეგისტრატურა ხელით დაამატებს */
  skipped: string[];
  /** დაურიცხავი დანიშნულებების id-ები (დასრულებისას invoice_id ჩაეწერება) */
  orderIds: number[];
  hasPrimaryDiagnosis: boolean;
};

/**
 * ვიზიტის დასრულების ბილინგი: ჯავშანს ინვოისი თუ არ აქვს — ექიმის კონსულტაცია + დანიშნული კვლევები/პროცედურები;
 * თუ აქვს (რეგისტრატურამ მისვლისას შექმნა) — მხოლოდ ჯერ დაურიცხავი დანიშნულებები. გაუქმებული დანიშნულება არ ირიცხება.
 * ერთი და იგივე სერვისი რამდენჯერმეა — ერთი ხაზი რაოდენობით.
 */
export async function loadCompletionPreview(db: Db, encounterId: number): Promise<CompletionPreview | null> {
  const e = await db.encounter.findUnique({
    where: { id: encounterId },
    select: {
      appointmentId: true,
      appointment: { select: { doctor: { select: { consultationService: { select: { id: true, name: true, price: true, isActive: true } } } } } },
      orders: {
        where: { status: { not: "cancelled" }, invoiceId: null },
        select: { id: true, serviceName: true, service: { select: { id: true, name: true, price: true, isActive: true } } },
        orderBy: { id: "asc" },
      },
      _count: { select: { diagnoses: { where: { isPrimary: true } } } },
    },
  });
  if (!e) return null;
  const existing = await db.invoice.findFirst({
    where: { appointmentId: e.appointmentId, status: { not: "cancelled" } },
    select: { invoiceNumber: true },
  });

  const lines = new Map<number, BillingLine>();
  const add = (s: { id: number; name: string; price: { toFixed(n: number): string } }) => {
    const line = lines.get(s.id);
    if (line) line.quantity = Math.min(line.quantity + 1, 99);
    else lines.set(s.id, { serviceId: s.id, name: s.name, quantity: 1, price: s.price.toFixed(2) });
  };

  const consultation = e.appointment.doctor.consultationService;
  if (!existing && consultation?.isActive) add(consultation);
  const skipped: string[] = [];
  for (const o of e.orders) {
    if (o.service.isActive) add(o.service);
    else skipped.push(o.serviceName);
  }

  return {
    existingInvoice: existing?.invoiceNumber ?? null,
    lines: [...lines.values()],
    skipped,
    orderIds: e.orders.filter((o) => o.service.isActive).map((o) => o.id),
    hasPrimaryDiagnosis: e._count.diagnoses > 0,
  };
}

export const loadCompletionPreviewForView = (encounterId: number) => loadCompletionPreview(prisma, encounterId);

/**
 * ვიზიტის დასრულება (გამომძახებლის ტრანზაქციაში; უფლებას გამომძახებელი ამოწმებს): შემოწმება (საკუთარი, დაუსრულებელი,
 * ბოლო შენახული ვერსია, ძირითადი დიაგნოზი) → ინვოისი (ფასები და დაზღვევა — ფინანსების მოდულით, ექიმი ფასს ვერ ცვლის) →
 * დანიშნულებები მოინიშნება დარიცხულად → ჩანაწერი იკეტება, ჯავშანი — „დასრულებული“. აბრუნებს შეტყობინების ტექსტს.
 * FinanceError → EmrError („ინვოისი ვერ შეიქმნა: ...“).
 */
export async function completeEncounter(tx: Db, { encounterId, version, userId }: { encounterId: number; version: number; userId: number }) {
  try {
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
    const missing = await missingRequiredMeasurements(tx, encounterId);
    if (missing.length) throw new EmrError(`შეავსეთ სავალდებულო მაჩვენებლები: ${missing.join(", ")}`);

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
  } catch (error) {
    if (error instanceof FinanceError) throw new EmrError(`ინვოისი ვერ შეიქმნა: ${error.message}`);
    throw error;
  }
}
