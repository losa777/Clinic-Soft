/**
 * პაციენტის მიღების (ვიზიტის) ვალიდაცია და ტიპები — საერთო კლიენტისა და სერვერისთვის.
 */
import { z } from "zod";
import { moneySchema } from "@/lib/money";

export const VISIT_TYPES = [
  { value: "outpatient", label: "ამბულატორიული" },
  { value: "day_hospital", label: "დღის სტაციონარი" },
] as const;

export const PAYMENT_METHODS = [
  { value: "cash", label: "ნაღდი" },
  { value: "cashless", label: "უნაღდო" },
] as const;

export type VisitType = (typeof VISIT_TYPES)[number]["value"];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((i) => i.value === value)?.label ?? value;
export const visitTypeLabel = (type: string) => labelOf(VISIT_TYPES, type);
export const paymentMethodLabel = (method: string) => labelOf(PAYMENT_METHODS, method);

const visitTypeSchema = z.enum(["outpatient", "day_hospital"], { error: "აირჩიეთ მიღების ტიპი" });
const paymentMethodSchema = z.enum(["cash", "cashless"], { error: "აირჩიეთ გადახდის ფორმა" });

export const visitSchema = z.object({
  patientId: z.number().int().positive(),
  doctorId: z.number({ error: "აირჩიეთ ექიმი" }).int().positive("აირჩიეთ ექიმი"),
  visitAt: z.iso.datetime({ offset: true, error: "მიუთითეთ ვიზიტის თარიღი და დრო" }),
  visitType: visitTypeSchema,
  serviceIds: z
    .array(z.number().int().positive())
    .min(1, "აირჩიეთ მინიმუმ ერთი სერვისი")
    .max(50, "ერთ ვიზიტზე მაქსიმუმ 50 სერვისი")
    .refine((ids) => new Set(ids).size === ids.length, "სერვისი ორჯერაა არჩეული"),
  paidAmount: moneySchema("შეიყვანეთ გადახდილი თანხა, მაგ. 25 ან 25.50"),
  /** პირველი გადახდის ფორმა (გამოიყენება, თუ გადახდილი თანხა > 0) */
  paymentMethod: paymentMethodSchema,
  comment: z
    .string()
    .trim()
    .max(2000, "კომენტარი ძალიან გრძელია")
    .transform((v) => v || null),
});

export type VisitInput = z.input<typeof visitSchema>;

/**
 * ვიზიტის რედაქტირება. სერვისები: უკვე ვიზიტში მყოფი (visitServiceId — ფასი უცვლელი რჩება)
 * ან ახლად დამატებული (serviceId — მიმდინარე ფასით). გადახდილი თანხა აქ არ იცვლება.
 */
export const visitUpdateSchema = z.object({
  visitId: z.number().int().positive(),
  doctorId: visitSchema.shape.doctorId,
  visitAt: visitSchema.shape.visitAt,
  visitType: visitTypeSchema,
  items: z
    .array(z.union([z.object({ visitServiceId: z.number().int().positive() }), z.object({ serviceId: z.number().int().positive() })]))
    .min(1, "აირჩიეთ მინიმუმ ერთი სერვისი")
    .max(50, "ერთ ვიზიტზე მაქსიმუმ 50 სერვისი"),
  comment: visitSchema.shape.comment,
});

export type VisitUpdateInput = z.input<typeof visitUpdateSchema>;

export const visitPaymentSchema = z.object({
  visitId: z.number().int().positive(),
  amount: moneySchema("შეიყვანეთ თანხა, მაგ. 25 ან 25.50").refine((v) => Number(v) > 0, "თანხა 0-ზე მეტი უნდა იყოს"),
  method: paymentMethodSchema,
});

export type VisitPaymentInput = z.input<typeof visitPaymentSchema>;

export const visitCancelSchema = z.object({
  visitId: z.number().int().positive(),
  reason: z.string().trim().min(3, "მიუთითეთ გაუქმების მიზეზი").max(500, "მიზეზი ძალიან გრძელია"),
});

export type VisitCancelInput = z.input<typeof visitCancelSchema>;

/** საქართველოს დრო (UTC+4, საზაფხულო დრო არ არის): datetime-local ველის მნიშვნელობა ამ დროით აღიქმება. */
const TBILISI_OFFSET = "+04:00";

/** "2026-10-21T14:30" (ფორმის ველი, თბილისის დრო) → ISO სტრიქონი სერვერისთვის. */
export function localToIso(local: string): string {
  return `${local}:00${TBILISI_OFFSET}`;
}

/** მიმდინარე დრო ფორმის ველისთვის, თბილისის დროით: "2026-10-21T14:30". */
export function nowLocal(): string {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** არჩევანი მიღების ფორმაში (ფასი სტრიქონად: "25.50"). */
export type ServiceOption = { id: number; code: string | null; name: string; price: string };
export type DoctorOption = { id: number; name: string };

/** ვიზიტი პაციენტის გვერდისთვის (თანხები სტრიქონად, თარიღები უკვე ფორმატირებული). */
export type VisitRow = {
  id: number;
  visitAt: string;
  doctorName: string;
  visitType: VisitType;
  services: { code: string | null; name: string; price: string }[];
  payments: { amount: string; method: PaymentMethod; createdAt: string; createdBy: string | null }[];
  totalAmount: string;
  paidAmount: string;
  debt: string;
  comment: string | null;
  createdBy: string | null;
  createdAt: string;
  /** null = არ შეცვლილა */
  updated: { by: string | null; at: string } | null;
  cancelled: { reason: string; by: string | null; at: string } | null;
};

/** ფორმაში არჩეული სერვისი: visitServiceId — უკვე შენახული (რედაქტირებისას), serviceId — კატალოგიდან. */
export type SelectedService = {
  key: string;
  visitServiceId?: number;
  serviceId: number | null;
  code: string | null;
  name: string;
  price: string;
};

/** რედაქტირების ფორმის საწყისი მნიშვნელობები. */
export type VisitEditData = {
  visitId: number;
  doctor: DoctorOption | null;
  visitAt: string;
  visitType: VisitType;
  items: SelectedService[];
  comment: string;
  paidAmount: string;
};
