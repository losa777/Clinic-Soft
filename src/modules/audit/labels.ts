/** აუდიტის ჟურნალის ქართული წარწერები (audit_log.entity / action — src/lib/audit.ts). უცნობი კოდი — თავად კოდი. */

export const ENTITY_LABELS: Record<string, string> = {
  session: "სისტემაში შესვლა",
  patient: "პაციენტი",
  patient_document: "პაციენტის ფაილი",
  appointment: "ჯავშანი",
  encounter: "ვიზიტი",
  document: "სამედიცინო დოკუმენტი",
  order: "დანიშნულება",
  prescription: "რეცეპტი",
  allergy: "ალერგია",
  condition: "დაავადება",
  medication: "მედიკამენტი",
  blood_group: "სისხლის ჯგუფი",
  invoice: "ინვოისი",
  user: "მომხმარებელი",
  role: "როლი",
  chat: "ჩატი",
  chat_retention: "ჩატის გასუფთავება",
  issue: "პრობლემა (ბილეთი)",
  issue_category: "პრობლემის კატეგორია",
  report: "ანგარიშგება (Excel)",
  bank: "ბანკი",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "ნახვა",
  create: "შექმნა",
  update: "შეცვლა",
  edit: "რედაქტირება",
  delete: "წაშლა",
  upload: "ატვირთვა",
  avatar_upload: "პროფილის ფოტოს ატვირთვა",
  avatar_remove: "პროფილის ფოტოს წაშლა",
  activate: "გააქტიურება",
  deactivate: "გათიშვა",
  start: "დაწყება",
  complete: "დასრულება",
  sign: "ხელმოწერა",
  print: "ბეჭდვა",
  verify: "შემოწმება",
  new_version: "ახალი ვერსია",
  cancel: "გაუქმება",
  refund: "თანხის დაბრუნება",
  sample_taken: "ნიმუში აღებულია",
  result: "შედეგი",
  done: "შესრულდა",
  no_show: "არ გამოცხადდა",
  login: "შესვლა",
  login_failed: "წარუმატებელი შესვლა",
  login_blocked: "შესვლა დაბლოკილია",
  unlock: "განბლოკვა",
  password_change: "პაროლის შეცვლა",
  password_failed: "პაროლის შეცვლის ცდა (არასწორი)",
  logout: "გასვლა",
  permissions: "უფლებების ცვლილება",
  purge: "გასუფთავება",
  status: "სტატუსის ცვლილება",
  comment: "კომენტარი",
  assign: "გადაცემა",
  export: "ექსპორტი",
  surgical: "საოპერაციოდ მონიშვნა",
  surgical_off: "„საოპერაციოს“ მოხსნა",
  portal_upload: "პორტალზე ატვირთულად მონიშვნა",
  portal_upload_undo: "ატვირთვის მონიშვნის მოხსნა",
};

/** მოქმედების ტონი სიაში: სახიფათო (წაშლა, გაუქმება, წარუმატებელი შესვლა) და ცვლილება — განსხვავებულად. */
export const ACTION_TONE: Record<string, "danger" | "change" | "view"> = {
  // პირადი/სამედიცინო მონაცემების ფაილად გატანა — ჟურნალში თვალსაჩინოდ
  export: "change",
  delete: "danger",
  cancel: "danger",
  refund: "danger",
  login_failed: "danger",
  login_blocked: "danger",
  password_failed: "danger",
  password_change: "change",
  unlock: "change",
  purge: "danger",
  deactivate: "danger",
  permissions: "change",
  view: "view",
  login: "view",
  logout: "view",
  print: "view",
  verify: "view",
};

export const entityLabel = (code: string) => ENTITY_LABELS[code] ?? code;
export const actionLabel = (code: string) => ACTION_LABELS[code] ?? code;

/** ფილტრის „ჯგუფები“: ხშირად საჭირო ჭრილები ერთი არჩევით. */
export const AUDIT_PRESETS = [
  { value: "", label: "ყველა მოქმედება" },
  { value: "patient_access", label: "პაციენტის მონაცემების ნახვა" },
  { value: "changes", label: "ცვლილებები და წაშლა" },
  { value: "security", label: "შესვლა, მომხმარებლები, როლები" },
  { value: "failed_logins", label: "წარუმატებელი შესვლები და ბლოკები" },
] as const;

export type AuditPreset = (typeof AUDIT_PRESETS)[number]["value"];
