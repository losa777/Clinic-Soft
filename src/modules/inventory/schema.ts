/**
 * საწყობის ვალიდაცია (zod) — საერთო კლიენტისა და სერვერისთვის. რაოდენობა სტრიქონად ("2,5") → მეასედები (stock.ts).
 * ბაზასთან დაკავშირებული შემოწმებები (დასახელება აქტიურია, ნაშთი ჰყოფნის) — სერვერზე, ტრანზაქციაში.
 */
import { z } from "zod";
import { isRealDate } from "@/lib/appointment-slots";
import { CATEGORIES, WRITEOFF_REASONS } from "./labels.ts";
import { MAX_QUANTITY, parseQuantity } from "./stock.ts";

const id = (message: string) => z.number({ error: message }).int().positive(message);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `მაქსიმუმ ${max} სიმბოლო`)
    .transform((v) => v || null);

/** რაოდენობა → მეასედები (> 0). allowZero — მინიმალური ნაშთისთვის. */
const quantity = (message = "შეიყვანეთ რაოდენობა, მაგ. 10 ან 2,5", allowZero = false) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const h = parseQuantity(v);
      if (h === null || (!allowZero && h === 0) || h > MAX_QUANTITY * 100) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return h;
    });

const optionalDate = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || isRealDate(v), message)
    .transform((v) => v || null);

export const itemSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "შეიყვანეთ დასახელება").max(200, "მაქსიმუმ 200 სიმბოლო"),
  category: z.enum(CATEGORIES.map((c) => c.value) as [string, ...string[]], { error: "აირჩიეთ კატეგორია" }),
  unit: z.string().trim().min(1, "მიუთითეთ საზომი ერთეული").max(20, "მაქსიმუმ 20 სიმბოლო"),
  minQuantity: quantity("მინიმალური ნაშთი: რიცხვი, მაგ. 10", true),
  tracksExpiry: z.boolean(),
  note: optionalText(500),
  isActive: z.boolean(),
});

export type ItemInput = z.input<typeof itemSchema>;

export const supplierSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "შეიყვანეთ დასახელება").max(200, "მაქსიმუმ 200 სიმბოლო"),
  taxId: optionalText(20).refine((v) => v === null || /^\d{9,11}$/.test(v), "საიდენტიფიკაციო კოდი: 9–11 ციფრი"),
  phone: optionalText(50),
  note: optionalText(500),
  isActive: z.boolean(),
});

export type SupplierInput = z.input<typeof supplierSchema>;

const COST = /^\d{1,10}([.,]\d{1,2})?$/;

export const receiptLineSchema = z.object({
  itemId: id("აირჩიეთ დასახელება"),
  quantity: quantity(),
  lotNumber: optionalText(50),
  expiryDate: optionalDate("არასწორი თარიღი"),
  unitCost: z
    .string()
    .trim()
    .refine((v) => v === "" || COST.test(v), "ფასი: მაგ. 1.20")
    .transform((v) => (v ? v.replace(",", ".") : null)),
});

export const receiptSchema = z.object({
  supplierId: z.number().int().positive().nullable(),
  documentNumber: optionalText(50),
  receivedOn: z.string().refine(isRealDate, "მიუთითეთ მიღების თარიღი"),
  note: optionalText(500),
  lines: z.array(receiptLineSchema).min(1, "დაამატეთ ერთი დასახელება მაინც").max(200, "ერთ შემოსავალში მაქსიმუმ 200 ხაზი"),
});

export type ReceiptInput = z.input<typeof receiptSchema>;
export type ReceiptLineInput = z.input<typeof receiptLineSchema>;

/** გახარჯვა: რაოდენობა FEFO-თი ნაწილდება ვარგის პარტიებზე. */
export const consumeSchema = z.object({
  itemId: id("აირჩიეთ დასახელება"),
  quantity: quantity(),
  note: optionalText(500),
  // ვის/სად გაიცა — სამეურნეო საქონელზე სავალდებულოა (მოწმდება სერვერზე, კატეგორიით)
  recipient: optionalText(100).optional(),
});

export type ConsumeInput = z.input<typeof consumeSchema>;

/** ჩამოწერა კონკრეტული პარტიიდან მიზეზით (ვადაგასული, დაზიანებული...). „სხვა“ — შენიშვნა სავალდებულოა. */
export const writeoffSchema = z
  .object({
    batchId: id("აირჩიეთ პარტია"),
    quantity: quantity(),
    reason: z.enum(WRITEOFF_REASONS.map((r) => r.value) as [string, ...string[]], { error: "აირჩიეთ მიზეზი" }),
    note: optionalText(500),
  })
  .refine((v) => v.reason !== "other" || v.note !== null, { path: ["note"], message: "მიუთითეთ მიზეზი" });

export type WriteoffInput = z.input<typeof writeoffSchema>;

const materialLine = z.object({ itemId: id("აირჩიეთ დასახელება"), quantity: quantity() });

const uniqueItems = (lines: { itemId: number }[]) => new Set(lines.map((l) => l.itemId)).size === lines.length;

/** სერვისის ნორმა: ერთ შესრულებაზე გასახარჯი მასალა. */
export const normsSchema = z.object({
  serviceId: id("აირჩიეთ სერვისი"),
  lines: z.array(materialLine).max(50, "მაქსიმუმ 50 დასახელება").refine(uniqueItems, "ერთი დასახელება ორჯერაა"),
});

export type NormsInput = z.input<typeof normsSchema>;

/** შესრულებისას გახარჯული მასალა (ნორმიდან, შესწორებული). */
export const materialsSchema = z.array(materialLine).max(50, "მაქსიმუმ 50 დასახელება").refine(uniqueItems, "ერთი დასახელება ორჯერაა");

export type MaterialsInput = z.input<typeof materialsSchema>;

/** ინვენტარიზაცია: მხოლოდ შეცვლილი ხაზები; expected — ფორმაში ნანახი ნაშთი (მეასედებში). */
export const countSchema = z.object({
  note: z.string().trim().min(3, "მიუთითეთ შენიშვნა, მაგ. „ინვენტარიზაცია 24.10.2026“").max(500, "მაქსიმუმ 500 სიმბოლო"),
  lines: z
    .array(
      z.object({
        batchId: id("პარტია ვერ მოიძებნა"),
        expected: z.number().int().min(0),
        counted: quantity("დათვლილი: რიცხვი, მაგ. 12 ან 0", true),
      }),
    )
    .min(1, "ცვლილება არ არის — შეიყვანეთ დათვლილი რაოდენობა")
    .max(2000),
});

export type CountInput = z.input<typeof countSchema>;

/** zod-ის შეცდომები სრული გზით: { "lines.2.quantity": "..." } (ფორმის ხაზებისთვის). */
export function issuePaths(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}
