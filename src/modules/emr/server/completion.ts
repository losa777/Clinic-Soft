import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

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
