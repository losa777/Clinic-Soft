/**
 * პრობლემების შეტყობინება: სტატუსების, პრიორიტეტების წარწერები და ნაგულისხმევი კატეგორიები.
 * სუფთა მოდული — სერვერი, ბრაუზერი, ტესტები და db:setup იყენებს.
 */

export const ISSUE_STATUSES = [
  { value: "new", label: "ახალი" },
  { value: "in_progress", label: "მუშავდება" },
  { value: "waiting", label: "ელოდება" },
  { value: "resolved", label: "გადაწყდა" },
  { value: "closed", label: "დახურული" },
  { value: "rejected", label: "უარყოფილი" },
] as const;

export type IssueStatusValue = (typeof ISSUE_STATUSES)[number]["value"];

/** ღია — ჯერ კიდევ საქმეა (შემსრულებლის რიგში ჩანს). resolved — ავტორის დადასტურებას ელოდება. */
export const OPEN_STATUSES: IssueStatusValue[] = ["new", "in_progress", "waiting"];
export const FINAL_STATUSES: IssueStatusValue[] = ["closed", "rejected"];

export const ISSUE_PRIORITIES = [
  { value: "normal", label: "ჩვეულებრივი" },
  { value: "high", label: "მაღალი" },
  { value: "urgent", label: "სასწრაფო" },
] as const;

export type IssuePriorityValue = (typeof ISSUE_PRIORITIES)[number]["value"];

const STATUS_LABELS = Object.fromEntries(ISSUE_STATUSES.map((s) => [s.value, s.label])) as Record<IssueStatusValue, string>;
const PRIORITY_LABELS = Object.fromEntries(ISSUE_PRIORITIES.map((p) => [p.value, p.label])) as Record<IssuePriorityValue, string>;

export const statusLabel = (s: IssueStatusValue) => STATUS_LABELS[s];
export const priorityLabel = (p: IssuePriorityValue) => PRIORITY_LABELS[p];

/** db:setup — მხოლოდ ცარიელ ცხრილში; role — სისტემური როლის კოდი (ვის მიდის). */
export const DEFAULT_ISSUE_CATEGORIES: { name: string; role: string; confidential?: boolean }[] = [
  { name: "ტექნიკა / აპარატურა", role: "it" },
  { name: "IT / პროგრამა", role: "it" },
  { name: "მასალა / საწყობი", role: "warehouse" },
  { name: "ფინანსები / დაზღვევა", role: "accountant" },
  { name: "პაციენტის საჩივარი", role: "director", confidential: true },
  { name: "სხვა", role: "admin" },
];

/** ერთ ბილეთზე / კომენტარზე მაქსიმუმ ამდენი ფაილი (ზომა — ჩატის ლიმიტი, src/modules/chat/config.ts). */
export const ISSUE_FILES_MAX = 4;

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 4000;
export const COMMENT_MAX = 4000;
export const RESOLUTION_MAX = 1000;
export const LOCATION_MAX = 100;
