/**
 * ექსპორტის სვეტები: თანამშრომელი ირჩევს, რომელი გავიდეს Excel-ში. ერთი ხაზი = ერთი ვიზიტი.
 * key — URL-ში (?col=) და შაბლონში ინახება, ამიტომ არსებულ კოდს ნუ შეცვლით (ახალი — დაამატეთ).
 * სუფთა მოდული (სერვერი, ბრაუზერი, ტესტები).
 */

export const COLUMN_GROUPS = [
  { value: "patient", label: "პირადი მონაცემები" },
  { value: "visit", label: "ვიზიტი" },
  { value: "record", label: "ისტორიის ჩანაწერი" },
  { value: "diagnosis", label: "დიაგნოზი" },
  { value: "surgical", label: "ოპერაცია და ატვირთვა" },
  { value: "form100", label: "ფორმა 100" },
] as const;

export type ColumnGroup = (typeof COLUMN_GROUPS)[number]["value"];

export const EXPORT_COLUMNS = [
  { key: "lastName", label: "გვარი", group: "patient", width: 16 },
  { key: "firstName", label: "სახელი", group: "patient", width: 14 },
  { key: "fatherName", label: "მამის სახელი", group: "patient", width: 14 },
  { key: "lastNameEn", label: "Last Name", group: "patient", width: 16 },
  { key: "firstNameEn", label: "First Name", group: "patient", width: 14 },
  { key: "personalId", label: "პირადი ნომერი", group: "patient", width: 14 },
  { key: "birthDate", label: "დაბადების თარიღი", group: "patient", width: 12 },
  { key: "age", label: "ასაკი", group: "patient", width: 7 },
  { key: "gender", label: "სქესი", group: "patient", width: 9 },
  { key: "phone", label: "ტელეფონი", group: "patient", width: 14 },
  { key: "email", label: "იმეილი", group: "patient", width: 20 },
  { key: "country", label: "ქვეყანა", group: "patient", width: 12 },
  { key: "city", label: "ქალაქი", group: "patient", width: 12 },
  { key: "actualAddress", label: "ფაქტიური მისამართი", group: "patient", width: 28 },
  { key: "legalAddress", label: "იურიდიული მისამართი", group: "patient", width: 28 },
  { key: "cardNumber", label: "სამედიცინო ბარათის №", group: "patient", width: 12 },
  { key: "insurance", label: "დაზღვევა (კომპანია, პოლისი)", group: "patient", width: 24 },

  { key: "visitDate", label: "ვიზიტის თარიღი", group: "visit", width: 16 },
  { key: "completedAt", label: "დასრულდა", group: "visit", width: 16 },
  { key: "visitStatus", label: "ვიზიტის სტატუსი", group: "visit", width: 12 },
  { key: "doctor", label: "ექიმი", group: "visit", width: 20 },
  { key: "specialty", label: "სპეციალობა", group: "visit", width: 18 },

  { key: "complaints", label: "ჩივილები", group: "record", width: 40 },
  { key: "anamnesisDisease", label: "დაავადების ანამნეზი", group: "record", width: 40 },
  { key: "anamnesisLife", label: "ცხოვრების ანამნეზი", group: "record", width: 40 },
  { key: "examination", label: "ობიექტური გასინჯვა", group: "record", width: 40 },
  { key: "vitals", label: "ვიტალური მაჩვენებლები", group: "record", width: 30 },
  { key: "treatmentPlan", label: "მკურნალობის გეგმა", group: "record", width: 40 },
  { key: "recommendations", label: "რეკომენდაციები", group: "record", width: 40 },
  // ადმინის დამატებული მაჩვენებლები — ყველა ერთ უჯრაში, თითო ხაზზე
  { key: "measurements", label: "სპეციალობის მაჩვენებლები", group: "record", width: 40 },

  { key: "primaryCode", label: "ძირითადი დიაგნოზი — კოდი", group: "diagnosis", width: 10 },
  { key: "primaryName", label: "ძირითადი დიაგნოზი", group: "diagnosis", width: 36 },
  { key: "complications", label: "გართულება", group: "diagnosis", width: 36 },
  { key: "concomitant", label: "თანმხლები დიაგნოზები", group: "diagnosis", width: 36 },

  { key: "surgical", label: "საოპერაციოა", group: "surgical", width: 10 },
  { key: "surgicalMarkedAt", label: "საოპერაციოდ მოინიშნა", group: "surgical", width: 16 },
  { key: "portalStatus", label: "პორტალზე ატვირთვა", group: "surgical", width: 12 },
  { key: "portalUploadedAt", label: "ატვირთვის თარიღი", group: "surgical", width: 16 },

  { key: "form100Number", label: "ფორმა 100 — №", group: "form100", width: 14 },
  { key: "form100Date", label: "ფორმა 100 — ხელმოწერის თარიღი", group: "form100", width: 16 },
] as const satisfies readonly { key: string; label: string; group: ColumnGroup; width: number }[];

export type ColumnKey = (typeof EXPORT_COLUMNS)[number]["key"];

/** ექსპორტის ხაზი: ყველა სვეტის ტექსტი (Excel-ში ყველა უჯრა ტექსტია). */
export type ExportRow = Record<ColumnKey, string> & { encounterId: number; patientId: number };

const KEYS = new Set<string>(EXPORT_COLUMNS.map((c) => c.key));
export const isColumnKey = (k: string): k is ColumnKey => KEYS.has(k);

/** პირველად გახსნისას მონიშნული სვეტები (თანამშრომელი ცვლის და შაბლონად ინახავს). */
export const DEFAULT_COLUMNS: ColumnKey[] = [
  "lastName",
  "firstName",
  "personalId",
  "birthDate",
  "gender",
  "visitDate",
  "doctor",
  "primaryCode",
  "primaryName",
  "form100Number",
];

/** URL-ის / შაბლონის კოდები → ცნობილი სვეტები, ცხრილის რიგით, დუბლიკატების გარეშე. */
export function pickColumns(keys: readonly string[]): ColumnKey[] {
  const wanted = new Set(keys.filter(isColumnKey));
  return EXPORT_COLUMNS.filter((c) => wanted.has(c.key)).map((c) => c.key);
}

export const columnOf = (key: ColumnKey) => EXPORT_COLUMNS.find((c) => c.key === key)!;
