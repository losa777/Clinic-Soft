/**
 * პაციენტის ფორმის ველები, არჩევანის სიები და ვალიდაცია.
 * ერთი და იგივე სქემა მოწმდება კლიენტზეც (ფორმა) და სერვერზეც (Server Actions).
 */
import { z } from "zod";

export const PERSONAL_ID_PATTERN = /^\d{11}$/;

export const GENDERS = [
  { value: "male", label: "მამრობითი" },
  { value: "female", label: "მდედრობითი" },
] as const;

export const MARITAL_STATUSES = [
  { value: "married", label: "დაოჯახებული" },
  { value: "single", label: "დასაოჯახებელი" },
  { value: "divorced", label: "განქორწინებული" },
  { value: "widowed", label: "ქვრივი" },
] as const;

export const DOCUMENT_TYPES = [
  { value: "id_card", label: "პირადობის მოწმობა" },
  { value: "passport", label: "პასპორტი" },
  { value: "insurance", label: "დაზღვევის პოლისი" },
  { value: "other", label: "სხვა" },
] as const;

/** ტიპები, რომლებსაც სისტემა თვითონ ანიჭებს (ხელით ატვირთვისას არ ჩანს): კვლევის შედეგი, სამედიცინო დოკუმენტი (PDF). */
export const SYSTEM_DOCUMENT_TYPES = [
  { value: "lab_result", label: "ლაბორატორიული შედეგი" },
  { value: "imaging", label: "ინსტრუმენტული კვლევა" },
  { value: "medical", label: "სამედიცინო დოკუმენტი" },
] as const;

/** ატვირთვის ფორმის ტიპი. */
export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];
/** ბაზაში შენახული ნებისმიერი ტიპი. */
export type StoredDocumentType = DocumentType | (typeof SYSTEM_DOCUMENT_TYPES)[number]["value"];

export function documentTypeLabel(type: string): string {
  return [...DOCUMENT_TYPES, ...SYSTEM_DOCUMENT_TYPES].find((t) => t.value === type)?.label ?? "სხვა";
}

export const DEFAULT_COUNTRY = "საქართველო";

/** ატვირთვის შეზღუდვები: ერთი ფაილი და ერთი შენახვის ჯამი. next.config.ts-ის ლიმიტები ამაზე მეტია. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES_PER_SAVE = 10;
export const MAX_TOTAL_UPLOAD = 40 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((i) => i.value) as [T[number]["value"], ...T[number]["value"][]];

const required = (label: string, max = 100) =>
  z.string().trim().min(1, `შეიყვანეთ ${label}`).max(max, `${label} ძალიან გრძელია`);

/** არასავალდებულო ტექსტი: ცარიელი → null. */
const optional = (label: string, max = 255) =>
  z
    .string()
    .trim()
    .max(max, `${label} ძალიან გრძელია`)
    .transform((v) => v || null);

const latinName = (label: string) =>
  required(label).regex(/^[A-Za-z][A-Za-z' -]*$/, "მხოლოდ ლათინური ასოები, ჰარი, დეფისი");

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isRealDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso);
}

export const personalIdSchema = z
  .string()
  .trim()
  .regex(PERSONAL_ID_PATTERN, "პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან");

export const patientSchema = z.object({
  personalId: personalIdSchema,
  firstName: required("სახელი"),
  lastName: required("გვარი"),
  fatherName: optional("მამის სახელი", 100),
  firstNameEn: latinName("First Name"),
  lastNameEn: latinName("Last Name"),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "შეიყვანეთ დაბადების თარიღი")
    .refine(isRealDate, "თარიღი არასწორია")
    .refine((v) => v >= "1900-01-01", "თარიღი არასწორია")
    .refine((v) => v <= todayIso(), "დაბადების თარიღი მომავალში ვერ იქნება"),
  gender: z.enum(values(GENDERS), { error: "აირჩიეთ სქესი" }),
  maritalStatus: z
    .union([z.literal(""), z.enum(values(MARITAL_STATUSES))], { error: "აირჩიეთ ოჯახური მდგომარეობა" })
    .transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9][0-9 ()-]{4,19})?$/, "ტელეფონის ნომერი არასწორია")
    .transform((v) => v || null),
  email: z
    .string()
    .trim()
    .max(255, "იმეილი ძალიან გრძელია")
    .pipe(z.union([z.literal(""), z.email("იმეილის ფორმატი არასწორია")]))
    .transform((v) => v || null),
  country: optional("ქვეყანა", 100),
  city: optional("ქალაქი", 100),
  actualAddress: optional("ფაქტიური მისამართი"),
  legalAddress: optional("იურიდიული მისამართი"),
  workplace: optional("სამუშაო ადგილი"),
  position: optional("თანამდებობა"),
  education: optional("განათლება"),
  comment: optional("კომენტარი", 5000),
});

/** ფორმის მნიშვნელობები (ყველა ველი სტრიქონია). */
export type PatientFormValues = z.input<typeof patientSchema>;
export type PatientData = z.output<typeof patientSchema>;

export const EMPTY_PATIENT: PatientFormValues = {
  personalId: "",
  firstName: "",
  lastName: "",
  fatherName: "",
  firstNameEn: "",
  lastNameEn: "",
  birthDate: "",
  gender: "" as PatientFormValues["gender"],
  maritalStatus: "",
  phone: "",
  email: "",
  country: DEFAULT_COUNTRY,
  city: "",
  actualAddress: "",
  legalAddress: "",
  workplace: "",
  position: "",
  education: "",
  comment: "",
};

/** ატვირთული ფაილის მეტამონაცემები (ფაილები FormData-ში იმავე რიგით მიდის). */
export const documentMetaSchema = z.object({
  docType: z.enum(values(DOCUMENT_TYPES), { error: "აირჩიეთ დოკუმენტის ტიპი" }),
  title: z.string().trim().min(1, "შეიყვანეთ დოკუმენტის სახელი").max(255, "სახელი ძალიან გრძელია"),
});

export type DocumentMeta = z.infer<typeof documentMetaSchema>;

/** ბაზაში შენახული დოკუმენტი (ფაილი იკითხება /api/patient-documents/<id>-ით). */
export type StoredDocument = {
  id: number;
  docType: StoredDocumentType;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string | null;
};

/** ნაპოვნი პაციენტი ფორმისთვის. */
export type PatientRecord = {
  id: number;
  values: PatientFormValues;
  documents: StoredDocument[];
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export function documentUrl(id: number): string {
  return `/api/patient-documents/${id}`;
}
