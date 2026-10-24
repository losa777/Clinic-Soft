/** საწყობის ტექსტები (სერვერი და ბრაუზერი). */

export const CATEGORIES = [
  { value: "medication", label: "მედიკამენტი" },
  { value: "consumable", label: "სახარჯი მასალა" },
  { value: "reagent", label: "რეაგენტი" },
] as const;

export type InventoryCategoryValue = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<InventoryCategoryValue, string>;

export const MOVEMENT_TYPES = [
  { value: "receipt", label: "შემოსავალი" },
  { value: "consumption", label: "გახარჯვა" },
  { value: "writeoff", label: "ჩამოწერა" },
  { value: "adjustment", label: "ინვენტარიზაცია" },
] as const;

export type MovementTypeValue = (typeof MOVEMENT_TYPES)[number]["value"];

export const MOVEMENT_LABELS = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.value, t.label])) as Record<MovementTypeValue, string>;

export const WRITEOFF_REASONS = [
  { value: "expired", label: "ვადაგასული" },
  { value: "damaged", label: "დაზიანებული" },
  { value: "lost", label: "დაკარგული" },
  { value: "other", label: "სხვა" },
] as const;

export type WriteoffReasonValue = (typeof WRITEOFF_REASONS)[number]["value"];

export const REASON_LABELS = Object.fromEntries(WRITEOFF_REASONS.map((r) => [r.value, r.label])) as Record<WriteoffReasonValue, string>;

/** ნაშთების ფილტრი (?status= — შეტყობინების ბმულიდანაც). */
export const STOCK_STATUSES = [
  { value: "all", label: "ყველა" },
  { value: "attention", label: "საჭიროებს ყურადღებას" },
  { value: "low", label: "მცირე / ამოწურული" },
  { value: "expiry", label: "ვადა: გასული / იწურება" },
  { value: "inactive", label: "გათიშული" },
] as const;

export type StockStatusFilter = (typeof STOCK_STATUSES)[number]["value"];

/** საზომი ერთეულის შეთავაზებები (ველში ნებისმიერი ტექსტი შეიძლება). */
export const UNIT_SUGGESTIONS = ["ცალი", "ამპულა", "ფლაკონი", "ტაბლეტი", "მლ", "გ", "წყვილი", "შეფუთვა", "ტესტი"];
