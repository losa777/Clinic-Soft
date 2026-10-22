/**
 * სამედიცინო დოკუმენტების შაბლონები — ველები, ხელმომწერები, ავტომატური შევსება ვიზიტიდან.
 * სუფთა მოდული (კლიენტიც იყენებს და ტესტებიც).
 *
 * ფორმის შესაცვლელად (მაგ. ოფიციალური IV-100/ა-ის ნიმუშით): შეცვალეთ შესაბამისი შაბლონის `fields` —
 * ველის დამატება/წაშლა/გადარქმევა, რიგი PDF-შიც ასევე აისახება. `prefill` ავსებს ველებს ვიზიტიდან.
 * უკვე ხელმოწერილი დოკუმენტები არ იცვლება: მათი PDF შენახულია, content-ში კი ძველი ველები რჩება.
 */

export type DocumentTypeCode = "visit_summary" | "certificate_100" | "referral" | "consent";
export type SignerRoleCode = "doctor" | "patient";

export type FieldKind = "text" | "textarea" | "date";

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
  /** ხელმომწერები: required — ხელმოწერის გარეშე დოკუმენტი არ დაიხურება; ექიმი ყოველთვის სავალდებულოა */
  signers: { role: SignerRoleCode; required: boolean }[];
};

/** ავტომატური შევსების მონაცემები (ვიზიტი, პაციენტი). */
export type PrefillContext = {
  visitDate: string;
  patient: { address: string | null };
  diagnoses: { code: string; name: string; primary: boolean }[];
  complaints: string | null;
  anamnesisDisease: string | null;
  examination: string | null;
  treatmentPlan: string | null;
  recommendations: string | null;
  vitals: string | null;
  prescriptions: string[];
  studies: string[];
};

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
      { key: "vitals", label: "ვიტალური მაჩვენებლები", kind: "text" },
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
      vitals: c.vitals ?? "",
      diagnosis: diagnosisText(c),
      studies: c.studies.join("\n"),
      treatment: lines(c.treatmentPlan, ...c.prescriptions.map((p) => `• ${p}`)),
      recommendations: c.recommendations ?? "",
    }),
  },

  // ⚠ სამუშაო ვერსია: ველები ოფიციალური IV-100/ა ფორმის ნიმუშით უნდა დაზუსტდეს
  certificate_100: {
    type: "certificate_100",
    title: "ცნობა ჯანმრთელობის მდგომარეობის შესახებ",
    subtitle: "ფორმა N IV-100/ა",
    fields: [
      { key: "destination", label: "წარსადგენად (დაწესებულება)", kind: "text", required: true, placeholder: "მაგ. სამუშაო ადგილზე" },
      { key: "address", label: "პაციენტის მისამართი", kind: "text" },
      { key: "workplace", label: "სამუშაო ადგილი / თანამდებობა", kind: "text" },
      { key: "periodFrom", label: "მკურნალობის პერიოდი — დან", kind: "date" },
      { key: "periodTo", label: "მკურნალობის პერიოდი — მდე", kind: "date" },
      { key: "diagnosis", label: "დიაგნოზი (ICD-10)", kind: "textarea", required: true },
      { key: "anamnesis", label: "მოკლე ანამნეზი", kind: "textarea" },
      { key: "studies", label: "ჩატარებული გამოკვლევები", kind: "textarea" },
      { key: "treatment", label: "ჩატარებული მკურნალობა", kind: "textarea" },
      { key: "condition", label: "მდგომარეობა გაწერისას", kind: "textarea" },
      { key: "recommendations", label: "რეკომენდაციები", kind: "textarea" },
    ],
    signers: [{ role: "doctor", required: true }],
    prefill: (c) => ({
      destination: "",
      address: c.patient.address ?? "",
      workplace: "",
      periodFrom: c.visitDate,
      periodTo: c.visitDate,
      diagnosis: diagnosisText(c),
      anamnesis: lines(c.complaints, c.anamnesisDisease),
      studies: c.studies.join("\n"),
      treatment: lines(c.treatmentPlan, ...c.prescriptions.map((p) => `• ${p}`)),
      condition: "",
      recommendations: c.recommendations ?? "",
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

export const SIGNER_ROLE_LABELS: Record<SignerRoleCode, string> = { doctor: "ექიმი", patient: "პაციენტი" };

const fieldMax = (f: FieldDef) => f.max ?? (f.kind === "textarea" ? 5000 : 500);

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
    if (v.length > fieldMax(f)) errors[f.key] = `მაქსიმუმ ${fieldMax(f)} სიმბოლო`;
    else if (f.kind === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.key] = "თარიღი არასწორია";
    else if (strict && f.required && !v) errors[f.key] = "სავალდებულო ველი";
    values[f.key] = v;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
