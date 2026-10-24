/** საწყობის ტექსტები (სერვერი და ბრაუზერი). */

export const CATEGORIES = [
  { value: "medication", label: "მედიკამენტი" },
  { value: "consumable", label: "სახარჯი მასალა" },
  { value: "reagent", label: "რეაგენტი" },
  { value: "stationery", label: "საკანცელარიო" },
  { value: "household", label: "სამეურნეო" },
] as const;

export type InventoryCategoryValue = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<InventoryCategoryValue, string>;

/**
 * ჯგუფები: სამედიცინო (სერია/ვადა, იხარჯება პაციენტზე/პროცედურაზე, ნორმებში) და სამეურნეო (საკანცელარიო,
 * სამეურნეო — ვადის გარეშე, გაიცემა განყოფილებაზე; მართავს მხოლოდ საწყობი/ადმინი, ხედავს ანგარიშების როლიც).
 */
export const MEDICAL_CATEGORIES: InventoryCategoryValue[] = ["medication", "consumable", "reagent"];
export const GENERAL_CATEGORIES: InventoryCategoryValue[] = ["stationery", "household"];

export type CategoryGroup = "medical" | "general";

export const isMedical = (category: InventoryCategoryValue) => MEDICAL_CATEGORIES.includes(category);

export const GROUP_FILTERS = [
  { value: "all", label: "ყველა" },
  { value: "medical", label: "სამედიცინო" },
  { value: "general", label: "სამეურნეო" },
] as const;

export type GroupFilter = (typeof GROUP_FILTERS)[number]["value"];

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
export const UNIT_SUGGESTIONS = ["ცალი", "ამპულა", "ფლაკონი", "ტაბლეტი", "მლ", "გ", "წყვილი", "შეფუთვა", "ტესტი", "ლ", "კგ", "რულონი", "ყუთი"];
