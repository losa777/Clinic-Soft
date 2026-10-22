/**
 * სამედიცინო ჩანაწერის (EMR) ვალიდაცია და არჩევანის სიები — საერთო კლიენტისა და სერვერისთვის.
 */
import { z } from "zod";
import { isRealDate } from "@/lib/appointment-slots";
import { checkVital, VITAL_KEYS, type VitalKey } from "@/modules/emr/vitals";

export const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

export const ALLERGY_SEVERITIES = [
  { value: "mild", label: "მსუბუქი" },
  { value: "moderate", label: "საშუალო" },
  { value: "severe", label: "მძიმე" },
] as const;

export const allergySeverityLabel = (s: string) => ALLERGY_SEVERITIES.find((x) => x.value === s)?.label ?? s;

const text = (label: string, max: number) => z.string().trim().min(1, `შეიყვანეთ ${label}`).max(max, `${label} ძალიან გრძელია`);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "ტექსტი ძალიან გრძელია")
    .transform((v) => v || null);

export const allergySchema = z.object({
  patientId: z.number().int().positive(),
  substance: text("ნივთიერება / მედიკამენტი", 200),
  reaction: optional(500),
  severity: z.enum(["mild", "moderate", "severe"], { error: "აირჩიეთ სიმძიმე" }),
});
export type AllergyInput = z.input<typeof allergySchema>;

export const conditionSchema = z.object({
  patientId: z.number().int().positive(),
  icd10Code: z.string().trim().max(10).nullable(),
  name: text("დაავადება", 500),
  since: z.union([z.literal(""), z.string().refine(isRealDate, "თარიღი არასწორია")]).transform((v) => v || null),
  note: optional(500),
});
export type ConditionInput = z.input<typeof conditionSchema>;

export const medicationSchema = z.object({
  patientId: z.number().int().positive(),
  drugName: text("მედიკამენტი", 200),
  dose: optional(100),
  frequency: optional(100),
  note: optional(500),
});
export type MedicationInput = z.input<typeof medicationSchema>;

export const bloodGroupSchema = z.object({
  patientId: z.number().int().positive(),
  bloodGroup: z.union([z.literal(""), z.enum(BLOOD_GROUPS)]).transform((v) => v || null),
});
export type BloodGroupInput = z.input<typeof bloodGroupSchema>;

/** ვიზიტის ფორმის ტექსტური ველები; template — შაბლონის ველის კოდი (doctor_templates.field). */
export const TEXT_FIELDS = [
  { key: "complaints", template: "complaints", label: "ჩივილები" },
  { key: "anamnesisDisease", template: "anamnesis_disease", label: "დაავადების ანამნეზი" },
  { key: "anamnesisLife", template: "anamnesis_life", label: "ცხოვრების ანამნეზი" },
  { key: "examination", template: "examination", label: "ობიექტური გასინჯვა" },
  { key: "treatmentPlan", template: "treatment_plan", label: "მკურნალობის გეგმა" },
  { key: "recommendations", template: "recommendations", label: "რეკომენდაციები" },
] as const;

export type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"];
export type TemplateFieldCode = (typeof TEXT_FIELDS)[number]["template"];

const longText = z
  .string()
  .max(10_000, "ტექსტი ძალიან გრძელია (მაქს. 10 000 სიმბოლო)")
  .transform((v) => v.trim() || null);

const vital = (key: VitalKey) =>
  z
    .number()
    .nullable()
    .superRefine((v, ctx) => {
      const error = checkVital(key, v);
      if (error) ctx.addIssue({ code: "custom", message: error });
    });

/**
 * ვიზიტის ფორმა (ავტოშენახვა): ტექსტები, ვიტალური, დიაგნოზები. version — ოპტიმისტური ჩაკეტვა:
 * შენახვა მხოლოდ მაშინ, თუ ჩანაწერი ამასობაში სხვა ფანჯრიდან არ შეცვლილა.
 */
export const encounterDraftSchema = z.object({
  encounterId: z.number().int().positive(),
  version: z.number().int().positive(),
  complaints: longText,
  anamnesisDisease: longText,
  anamnesisLife: longText,
  examination: longText,
  treatmentPlan: longText,
  recommendations: longText,
  ...(Object.fromEntries(VITAL_KEYS.map((k) => [k, vital(k)])) as Record<VitalKey, ReturnType<typeof vital>>),
  diagnoses: z
    .array(z.object({ code: z.string().trim().min(1).max(10), primary: z.boolean() }))
    .max(20, "მაქსიმუმ 20 დიაგნოზი")
    .refine((d) => d.filter((x) => x.primary).length <= 1, "ძირითადი დიაგნოზი მხოლოდ ერთი შეიძლება")
    .refine((d) => new Set(d.map((x) => x.code)).size === d.length, "დიაგნოზი ორჯერაა"),
});
export type EncounterDraftInput = z.input<typeof encounterDraftSchema>;

export const templateSchema = z.object({
  field: z.enum(TEXT_FIELDS.map((f) => f.template) as [TemplateFieldCode, ...TemplateFieldCode[]]),
  title: z.string().trim().min(1, "შეიყვანეთ შაბლონის სახელი").max(100, "მაქსიმუმ 100 სიმბოლო"),
  content: z.string().trim().min(1, "შაბლონი ცარიელია").max(10_000, "ტექსტი ძალიან გრძელია"),
});
export type TemplateInput = z.input<typeof templateSchema>;

// ─── დანიშნულებები ───

export const prescriptionSchema = z.object({
  encounterId: z.number().int().positive(),
  drugName: text("მედიკამენტი", 200),
  dose: text("დოზა", 100),
  form: optional(100),
  frequency: text("მიღების სიხშირე", 100),
  duration: optional(100),
  note: optional(500),
  /** ექიმმა ალერგიის გაფრთხილება ნახა და მაინც ნიშნავს */
  acknowledgeAllergy: z.boolean(),
});
export type PrescriptionInput = z.input<typeof prescriptionSchema>;

export const ORDER_TYPE_LABELS = { lab: "ლაბორატორიული კვლევა", instrumental: "ინსტრუმენტული კვლევა", procedure: "ექთნის პროცედურა" } as const;
export type OrderTypeCode = keyof typeof ORDER_TYPE_LABELS;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  ordered: "დანიშნული",
  sample_taken: "ნიმუში აღებულია",
  ready: "მზადაა",
  done: "შესრულებულია",
  cancelled: "გაუქმებული",
};

export const orderSchema = z.object({
  encounterId: z.number().int().positive(),
  serviceId: z.number({ error: "აირჩიეთ სერვისი" }).int().positive("აირჩიეთ სერვისი"),
  type: z.enum(["lab", "instrumental", "procedure"]),
  note: optional(500),
});
export type OrderInput = z.input<typeof orderSchema>;

export const procedureDoneSchema = z.object({ orderId: z.number().int().positive(), note: optional(500) });
export type ProcedureDoneInput = z.input<typeof procedureDoneSchema>;

/** პროფილის ჩანაწერის გათიშვა (არ იშლება — ისტორიაში რჩება). */
export const profileItemSchema = z.object({
  kind: z.enum(["allergy", "condition", "medication"]),
  id: z.number().int().positive(),
});
export type ProfileItemInput = z.input<typeof profileItemSchema>;
