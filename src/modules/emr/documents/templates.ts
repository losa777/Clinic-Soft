/**
 * სამედიცინო დოკუმენტების შაბლონები — ველები, ხელმომწერები, ავტომატური შევსება ვიზიტიდან.
 * სუფთა მოდული (კლიენტიც იყენებს და ტესტებიც).
 *
 * ფორმის შესაცვლელად: შეცვალეთ შესაბამისი შაბლონის `fields` (ველის დამატება/წაშლა/გადარქმევა), `prefill` — რით ივსება
 * ვიზიტიდან. ზოგადი PDF ველებს რიგით ბეჭდავს; ფორმა 100-ს (IV-100/ა) საკუთარი განლაგება აქვს — form100-pdf.ts
 * (პუნქტების ნომრები და ველების გასაღებები ერთმანეთს უნდა ემთხვეოდეს).
 * უკვე ხელმოწერილი დოკუმენტები არ იცვლება: მათი PDF შენახულია, content-ში კი ძველი ველები რჩება.
 */

export type DocumentTypeCode = "visit_summary" | "certificate_100" | "referral" | "consent";
export type SignerRoleCode = "doctor" | "patient" | "head";

/** medications — მედიკამენტების ცხრილი (JSON: MedicationRow[]) */
export type FieldKind = "text" | "textarea" | "date" | "medications";

export type MedicationRow = { drug: string; note: string; duration: string; quantity: string; rxNumber: string };
export const MEDICATION_COLUMNS: { key: keyof MedicationRow; label: string; max: number }[] = [
  { key: "drug", label: "დანიშნულება", max: 300 },
  { key: "note", label: "შენიშვნა", max: 300 },
  { key: "duration", label: "ვადა", max: 50 },
  { key: "quantity", label: "რაოდენობა", max: 20 },
  { key: "rxNumber", label: "რეცეპტის ნომერი", max: 50 },
];
const MAX_MEDICATION_ROWS = 30;

export function parseMedications(value: string | undefined): MedicationRow[] {
  try {
    const rows = JSON.parse(value || "[]") as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, MAX_MEDICATION_ROWS).map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return Object.fromEntries(MEDICATION_COLUMNS.map((c) => [c.key, typeof o[c.key] === "string" ? (o[c.key] as string) : ""])) as MedicationRow;
    });
  } catch {
    return [];
  }
}

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** მაქს. სიმბოლო (ნაგულისხმევად text — 500, textarea — 5000) */
  max?: number;
  placeholder?: string;
};

export type DocumentTemplate = {
  type: DocumentTypeCode;
  /** სათაური დოკუმენტზე და სიაში */
  title: string;
  /** ქვესათაური PDF-ში (მაგ. ფორმის ნომერი) */
  subtitle?: string;
  fields: FieldDef[];
  /**
   * ხელმომწერები: required — ხელმოწერის გარეშე დოკუმენტი არ დაიხურება (ელექტრონულად ან „დაბეჭდვის შემდეგ“ — ხელით);
   * ექიმი ყოველთვის სავალდებულოა.
   */
  signers: { role: SignerRoleCode; required: boolean }[];
  /** ბეჭედი („ადმინი → რეკვიზიტები“) — ხელმოწერისას შეიძლება დაისვას */
  stamp?: boolean;
  /** ხელმოწერისას ენიჭება თანმიმდევრული ნომერი (ფორმა 100 — ცნობის №) */
  numbered?: boolean;
};

/** ავტომატური შევსების მონაცემები (ვიზიტი, პაციენტი). თარიღები — DD/MM/YYYY, დრო — HH:MM. */
export type PrefillContext = {
  visitDate: string;
  /** ვიზიტის დაწყება / დასრულება: „06/10/2026 10:30“ */
  visitStart: string;
  visitEnd: string | null;
  patient: { address: string | null; conditions: string[] };
  diagnoses: { code: string; name: string; primary: boolean; complication: boolean }[];
  complaints: string | null;
  anamnesisDisease: string | null;
  examination: string | null;
  treatmentPlan: string | null;
  recommendations: string | null;
  vitals: string | null;
  prescriptions: string[];
  studies: string[];
  /** მედიკამენტების ცხრილი (რეცეპტიდან) */
  medicationRows: MedicationRow[];
  /** ჩატარებული კვლევები/კონსულტაციები კოდით და თარიღით: „თვალის წნევის გაზომვა 06/10/2026“ */
  studiesDated: string[];
  /** ჩატარებული პროცედურები კოდით და თარიღით */
  proceduresDated: string[];
  /** სპეციალობის მაჩვენებლები: „თვალშიდა წნევა (T) OD: 15.0 მმ Hg“ */
  measurements: string[];
};

const dxOf = (c: PrefillContext, kind: "primary" | "complication" | "concomitant") =>
  c.diagnoses
    .filter((d) => (kind === "primary" ? d.primary : kind === "complication" ? !d.primary && d.complication : !d.primary && !d.complication))
    .map((d) => `${d.code} ${d.name}`)
    .join("\n");

const diagnosisText = (c: PrefillContext) =>
  [...c.diagnoses].sort((a, b) => Number(b.primary) - Number(a.primary)).map((d) => `${d.code} — ${d.name}`).join("\n");

const lines = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join("\n");

export const DOCUMENT_TEMPLATES: Record<DocumentTypeCode, DocumentTemplate & { prefill: (c: PrefillContext) => Record<string, string> }> = {
  visit_summary: {
    type: "visit_summary",
    title: "ამბულატორიული ვიზიტის ამონაწერი",
    fields: [
      { key: "complaints", label: "ჩივილები", kind: "textarea" },
      { key: "anamnesis", label: "ანამნეზი", kind: "textarea" },
      { key: "examination", label: "ობიექტური გასინჯვა", kind: "textarea" },
      // რამდენიმე ხაზი: ვიტალური + სპეციალობის მაჩვენებლები (prefill — lines())
      { key: "vitals", label: "ვიტალური მაჩვენებლები", kind: "textarea" },
      { key: "diagnosis", label: "დიაგნოზი (ICD-10)", kind: "textarea", required: true },
      { key: "studies", label: "ჩატარებული / დანიშნული კვლევები", kind: "textarea" },
      { key: "treatment", label: "მკურნალობა", kind: "textarea" },
      { key: "recommendations", label: "რეკომენდაციები", kind: "textarea" },
    ],
    signers: [{ role: "doctor", required: true }],
    prefill: (c) => ({
      complaints: c.complaints ?? "",
      anamnesis: c.anamnesisDisease ?? "",
      examination: c.examination ?? "",
      vitals: lines(c.vitals, ...c.measurements),
      diagnosis: diagnosisText(c),
      studies: c.studies.join("\n"),
      treatment: lines(c.treatmentPlan, ...c.prescriptions.map((p) => `• ${p}`)),
      recommendations: c.recommendations ?? "",
    }),
  },

  // ფორმა IV-100/ა (შრომის, ჯანმრთელობისა და სოციალური დაცვის მინისტრის 2007 წლის 9 აგვისტოს №338/ნ ბრძანება, დანართი №2).
  // პუნქტები 1, 3–5, 18–20 ივსება ავტომატურად (კლინიკა, პაციენტი, ბარათი, ხელმოწერები, თარიღი) — form100-pdf.ts
  certificate_100: {
    type: "certificate_100",
    title: "ცნობა ჯანმრთელობის მდგომარეობის შესახებ",
    subtitle: "ფორმა N IV-100/ა",
    fields: [
      { key: "destination", label: "2. დაწესებულება, სადაც იგზავნება ცნობა", kind: "text", required: true },
      { key: "address", label: "6. მისამართი", kind: "text" },
      { key: "workplace", label: "7. სამუშაო ადგილი და თანამდებობა", kind: "text" },
      { key: "dateReferral", label: "8ა. ამბულატორიული მიმართვის თარიღი", kind: "text", max: 50, placeholder: "06/10/2026 10:30" },
      { key: "dateHospitalSent", label: "8ბ. სტაციონარში გაგზავნის თარიღი", kind: "text", max: 50 },
      { key: "dateHospitalAdmitted", label: "8გ. სტაციონარში მოთავსების თარიღი", kind: "text", max: 50 },
      { key: "dateDischarge", label: "8დ. გაწერის თარიღი", kind: "text", max: 50 },
      { key: "dxPrimary", label: "9. დიაგნოზი — ძირითადი", kind: "textarea", required: true },
      { key: "dxComplication", label: "9. დიაგნოზი — გართულება", kind: "textarea" },
      { key: "dxConcomitant", label: "9. დიაგნოზი — თანმხლები", kind: "textarea" },
      { key: "pastDiseases", label: "10. გადატანილი დაავადებები", kind: "textarea" },
      { key: "anamnesis", label: "11. მოკლე ანამნეზი", kind: "textarea" },
      { key: "studies", label: "12. ჩატარებული დიაგნოსტიკური გამოკვლევები და კონსულტაციები", kind: "textarea", max: 10_000 },
      { key: "course", label: "13. ავადმყოფობის მიმდინარეობა", kind: "text", placeholder: "მაგ. ქრონიკული, მწვავე" },
      { key: "treatment", label: "14. ჩატარებული მკურნალობა", kind: "textarea", max: 10_000 },
      { key: "conditionSent", label: "15. მდგომარეობა სტაციონარში გაგზავნისას", kind: "textarea" },
      { key: "conditionDischarge", label: "16. მდგომარეობა სტაციონარიდან გაწერისას", kind: "textarea" },
      { key: "recommendations", label: "17. სამკურნალო და შრომითი რეკომენდაციები", kind: "textarea", max: 10_000 },
      { key: "medications", label: "17. დანიშნული მედიკამენტები", kind: "medications" },
    ],
    signers: [
      { role: "doctor", required: true },
      { role: "head", required: true },
    ],
    stamp: true,
    numbered: true,
    prefill: (c) => ({
      destination: "დანიშნულებისამებრ",
      address: c.patient.address ?? "",
      workplace: "",
      dateReferral: c.visitStart,
      dateHospitalSent: "",
      dateHospitalAdmitted: "",
      dateDischarge: c.visitEnd ?? "",
      dxPrimary: dxOf(c, "primary"),
      dxComplication: dxOf(c, "complication"),
      dxConcomitant: dxOf(c, "concomitant"),
      pastDiseases: c.patient.conditions.join("\n"),
      anamnesis: lines(c.complaints, c.anamnesisDisease),
      studies: lines(c.examination, c.vitals, ...c.measurements, ...c.studiesDated),
      course: "",
      treatment: lines(...c.proceduresDated, c.treatmentPlan),
      conditionSent: "",
      conditionDischarge: "",
      recommendations: c.recommendations ?? "",
      medications: JSON.stringify(c.medicationRows),
    }),
  },

  referral: {
    type: "referral",
    title: "მიმართვა",
    fields: [
      { key: "to", label: "ვისთან / სად (სპეციალისტი, დაწესებულება)", kind: "text", required: true },
      { key: "reason", label: "მიმართვის მიზეზი", kind: "textarea", required: true },
      { key: "diagnosis", label: "დიაგნოზი (ICD-10)", kind: "textarea" },
      { key: "findings", label: "მოკლე ანამნეზი და გამოკვლევები", kind: "textarea" },
    ],
    signers: [{ role: "doctor", required: true }],
    prefill: (c) => ({
      to: "",
      reason: "",
      diagnosis: diagnosisText(c),
      findings: lines(c.complaints, c.examination, ...c.studies),
    }),
  },

  consent: {
    type: "consent",
    title: "ინფორმირებული თანხმობა",
    fields: [
      { key: "procedure", label: "პროცედურა / მკურნალობა", kind: "text", required: true },
      { key: "explanation", label: "პაციენტს განემარტა (მიზანი, რისკები, ალტერნატივები)", kind: "textarea", required: true },
      {
        key: "statement",
        label: "პაციენტის განცხადება",
        kind: "textarea",
        required: true,
      },
    ],
    signers: [
      { role: "doctor", required: true },
      { role: "patient", required: true },
    ],
    prefill: () => ({
      procedure: "",
      explanation: "",
      statement: "ვადასტურებ, რომ მივიღე ამომწურავი ინფორმაცია, მესმის რისკები და თანახმა ვარ ჩატარდეს აღნიშნული პროცედურა.",
    }),
  },
};

export const DOCUMENT_TYPES = Object.values(DOCUMENT_TEMPLATES).map((t) => ({ value: t.type, label: t.title }));

export const isDocumentType = (v: string): v is DocumentTypeCode => v in DOCUMENT_TEMPLATES;

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: "დრაფტი",
  signed: "ხელმოწერილი",
  superseded: "ჩანაცვლებული",
};

export const SIGNER_ROLE_LABELS: Record<SignerRoleCode, string> = { doctor: "ექიმი", patient: "პაციენტი", head: "დაწესებულების ხელმძღვანელი" };

const fieldMax = (f: FieldDef) => f.max ?? (f.kind === "textarea" ? 5000 : f.kind === "medications" ? 30_000 : 500);

/**
 * ველების შემოწმება შაბლონით: უცნობი ველები იშლება, ტექსტი იჭრება (trim), სიგრძე და სავალდებულო ველები —
 * strict=true-ისას (ხელმოწერამდე). აბრუნებს გასუფთავებულ მნიშვნელობებს ან ველების შეცდომებს.
 */
export function validateDocumentValues(
  type: DocumentTypeCode,
  input: Record<string, unknown>,
  strict: boolean,
): { ok: true; values: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const f of DOCUMENT_TEMPLATES[type].fields) {
    const raw = input[f.key];
    const v = typeof raw === "string" ? raw.trim() : "";
    if (f.kind === "medications") {
      // ცხრილი: მხოლოდ ცნობილი სვეტები, სიგრძის შეზღუდვით; ცარიელი სტრიქონები იშლება
      const rows = parseMedications(v).filter((r) => MEDICATION_COLUMNS.some((c) => r[c.key].trim()));
      if (rows.some((r) => MEDICATION_COLUMNS.some((c) => r[c.key].length > c.max))) errors[f.key] = "ცხრილის ველი ძალიან გრძელია";
      values[f.key] = JSON.stringify(rows.map((r) => Object.fromEntries(MEDICATION_COLUMNS.map((c) => [c.key, r[c.key].trim()]))));
      continue;
    }
    if (v.length > fieldMax(f)) errors[f.key] = `მაქსიმუმ ${fieldMax(f)} სიმბოლო`;
    else if (f.kind === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.key] = "თარიღი არასწორია";
    else if (strict && f.required && !v) errors[f.key] = "სავალდებულო ველი";
    values[f.key] = v;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
