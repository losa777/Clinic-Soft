/**
 * ფინანსების ვალიდაცია (zod) — საერთო კლიენტისა და სერვერისთვის. სერვერი ყოველთვის თავიდან ამოწმებს.
 */
import { z } from "zod";
import { isRealDate } from "@/lib/appointment-slots";
import { checkCardReference } from "@/modules/finance/calc";

const MONEY = /^\d{1,10}([.,]\d{1,2})?$/;

/** თანხა სტრიქონად: "25", "25.5", "25,50" → "25.50"-ის ფორმატი; DECIMAL(12,2)-ის ფარგლებში. */
export const amountSchema = (message = "შეიყვანეთ თანხა, მაგ. 25 ან 25.50") =>
  z
    .string()
    .trim()
    .regex(MONEY, message)
    .transform((v) => v.replace(",", "."));

export const positiveAmountSchema = (message?: string) =>
  amountSchema(message).refine((v) => Number(v) > 0, "თანხა 0-ზე მეტი უნდა იყოს");

const percentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}([.,]\d{1,2})?$/, "პროცენტი: 0–100")
  .transform((v) => v.replace(",", "."))
  .refine((v) => Number(v) <= 100, "პროცენტი: 0–100");

const reason = (label = "მიზეზი") => z.string().trim().min(3, `მიუთითეთ ${label}`).max(500, `${label} ძალიან გრძელია`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "ტექსტი ძალიან გრძელია")
    .transform((v) => v || null);

export const invoiceItemSchema = z.object({
  serviceId: z.number().int().positive(),
  quantity: z.number({ error: "რაოდენობა" }).int("მთელი რიცხვი").min(1, "მინიმუმ 1").max(99, "მაქსიმუმ 99"),
  discountPercent: percentSchema,
});

export const invoiceSchema = z
  .object({
    patientId: z.number().int().positive(),
    appointmentId: z.number().int().positive().nullable(),
    doctorId: z.number().int().positive().nullable(),
    visitType: z.enum(["outpatient", "day_hospital"], { error: "აირჩიეთ მიღების ტიპი" }),
    serviceDate: z.iso.datetime({ offset: true, error: "მიუთითეთ მომსახურების თარიღი და დრო" }),
    items: z
      .array(invoiceItemSchema)
      .min(1, "დაამატეთ მინიმუმ ერთი სერვისი")
      .max(50, "ერთ ინვოისზე მაქსიმუმ 50 სერვისი")
      .refine((items) => new Set(items.map((i) => i.serviceId)).size === items.length, "სერვისი ორჯერაა — გაზარდეთ რაოდენობა"),
    /** დაზღვევის ხელით გამორთვა ამ ინვოისზე (მიზეზით) */
    disableInsurance: z.boolean(),
    disableInsuranceReason: optionalText(500),
    comment: optionalText(2000),
  })
  .refine((v) => !v.disableInsurance || (v.disableInsuranceReason?.length ?? 0) >= 3, {
    path: ["disableInsuranceReason"],
    message: "მიუთითეთ დაზღვევის გამორთვის მიზეზი",
  });

export type InvoiceInput = z.input<typeof invoiceSchema>;

export const cancelInvoiceSchema = z.object({ invoiceId: z.number().int().positive(), reason: reason("გაუქმების მიზეზი") });
export type CancelInvoiceInput = z.input<typeof cancelInvoiceSchema>;

const cardReferenceSchema = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    const error = checkCardReference(v);
    if (error) ctx.addIssue({ code: "custom", message: error });
  })
  .transform((v) => v || null);

export const paymentSchema = z
  .object({
    invoiceId: z.number().int().positive(),
    method: z.enum(["cash", "card"], { error: "აირჩიეთ გადახდის მეთოდი" }),
    amount: positiveAmountSchema(),
    /** ნაღდი: მიღებული თანხა (ხურდის გამოსათვლელად); ცარიელი — ზუსტი თანხა */
    receivedAmount: z.union([z.literal(""), amountSchema("შეიყვანეთ მიღებული თანხა")]).transform((v) => v || null),
    cardReference: cardReferenceSchema,
  });
export type PaymentInput = z.input<typeof paymentSchema>;

export const refundSchema = z.object({
  invoiceId: z.number().int().positive(),
  method: z.enum(["cash", "card"], { error: "აირჩიეთ დაბრუნების მეთოდი" }),
  amount: positiveAmountSchema(),
  reason: reason("დაბრუნების მიზეზი"),
  cardReference: cardReferenceSchema,
});
export type RefundInput = z.input<typeof refundSchema>;

export const openShiftSchema = z.object({ openingCash: amountSchema("შეიყვანეთ სალაროში არსებული ნაღდი, მაგ. 100") });
export type OpenShiftInput = z.input<typeof openShiftSchema>;

export const closeShiftSchema = z.object({
  shiftId: z.number().int().positive(),
  actualCash: amountSchema("შეიყვანეთ სალაროში დათვლილი ნაღდი"),
  note: optionalText(500),
});
export type CloseShiftInput = z.input<typeof closeShiftSchema>;

const policyCompany = z.number({ error: "აირჩიეთ სადაზღვევო კომპანია" }).int().positive("აირჩიეთ სადაზღვევო კომპანია");
const policyNumber = z.string().trim().min(1, "შეიყვანეთ პოლისის ნომერი").max(50, "მაქსიმუმ 50 სიმბოლო");
const policyDate = z.string().refine(isRealDate, "მიუთითეთ თარიღი");
const DATES_ORDER = "დასრულება დაწყებამდე ვერ იქნება";

export const policySchema = z
  .object({
    patientId: z.number().int().positive(),
    companyId: policyCompany,
    policyNumber,
    validFrom: policyDate,
    validTo: policyDate,
  })
  .refine((v) => v.validTo >= v.validFrom, { path: ["validTo"], message: DATES_ORDER });
export type PolicyInput = z.input<typeof policySchema>;

/**
 * პოლისი ახალი პაციენტის რეგისტრაციისას (პაციენტთან ერთად, ერთ ტრანზაქციაში).
 * ველებს policy-პრეფიქსი აქვს, რომ შეცდომები პაციენტის ველებს (მაგ. personalId) არ აერიოს.
 */
export const newPatientPolicySchema = z
  .object({
    policyCompanyId: policyCompany,
    policyNumber,
    policyValidFrom: policyDate,
    policyValidTo: policyDate,
  })
  .refine((v) => v.policyValidTo >= v.policyValidFrom, { path: ["policyValidTo"], message: DATES_ORDER });
export type NewPatientPolicyInput = z.input<typeof newPatientPolicySchema>;
export type NewPatientPolicy = z.output<typeof newPatientPolicySchema>;

/** ფორმის მდგომარეობა: enabled = false — პაციენტი დაზღვეული არ არის (პოლისი არ იქმნება). */
export type PolicyDraft = { enabled: boolean; companyId: string; policyNumber: string; validFrom: string; validTo: string };

export const EMPTY_POLICY_DRAFT: PolicyDraft = { enabled: false, companyId: "", policyNumber: "", validFrom: "", validTo: "" };

export function policyDraftInput(d: PolicyDraft): NewPatientPolicyInput | null {
  if (!d.enabled) return null;
  return { policyCompanyId: Number(d.companyId) || 0, policyNumber: d.policyNumber, policyValidFrom: d.validFrom, policyValidTo: d.validTo };
}

export const companySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "შეიყვანეთ დასახელება").max(150, "მაქსიმუმ 150 სიმბოლო"),
  isActive: z.boolean(),
});
export type CompanyInput = z.input<typeof companySchema>;

export const contractSchema = z
  .object({
    id: z.number().int().positive().optional(),
    companyId: z.number().int().positive(),
    target: z.enum(["service", "category"]),
    serviceId: z.number().int().positive().nullable(),
    categoryId: z.number().int().positive().nullable(),
    coveragePercent: percentSchema,
    limitAmount: z.union([z.literal(""), amountSchema("ლიმიტი: თანხა ან ცარიელი")]).transform((v) => v || null),
  })
  .refine((v) => (v.target === "service" ? v.serviceId !== null : v.categoryId !== null), {
    path: ["targetId"],
    message: "აირჩიეთ სერვისი ან კატეგორია",
  });
export type ContractInput = z.input<typeof contractSchema>;

export const serviceSchema = z.object({
  id: z.number().int().positive().optional(),
  // ICD-10 არასავალდებულოა: ცარიელი → null
  code: z
    .string()
    .trim()
    .max(30, "მაქსიმუმ 30 სიმბოლო")
    .regex(/^[\p{L}\p{N}._/-]*$/u, "ICD-10 კოდში დასაშვებია ასოები, ციფრები და . _ / -")
    .transform((v) => v || null),
  name: z.string().trim().min(2, "შეიყვანეთ სერვისის დასახელება").max(255, "მაქსიმუმ 255 სიმბოლო"),
  categoryId: z.number({ error: "აირჩიეთ კატეგორია" }).int().positive("აირჩიეთ კატეგორია"),
  price: amountSchema("შეიყვანეთ ფასი, მაგ. 25 ან 25.50"),
  isActive: z.boolean(),
});
export type ServiceInput = z.input<typeof serviceSchema>;

/** ექიმის დანიშნულების ტიპი კატეგორიაზე (null — ამ კატეგორიის სერვისები არ ინიშნება, მაგ. კონსულტაცია). */
export const ORDER_TYPES = [
  { value: "lab", label: "ლაბორატორიული კვლევა" },
  { value: "instrumental", label: "ინსტრუმენტული კვლევა" },
  { value: "procedure", label: "ექთნის პროცედურა" },
] as const;

export const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "შეიყვანეთ კატეგორიის დასახელება").max(100, "მაქსიმუმ 100 სიმბოლო"),
  orderType: z.enum(["lab", "instrumental", "procedure"]).nullable(),
});
export type CategoryInput = z.input<typeof categorySchema>;
