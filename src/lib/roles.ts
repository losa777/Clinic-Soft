/**
 * სისტემური როლები: კოდი (URL-ში) → ქართული სახელი.
 * ბაზაში იწერება `npm run db:setup`-ით. მათი წაშლა ადმინის პანელიდან არ შეიძლება,
 * რადგან სისტემის ფუნქციონალი მათ კოდებზეა მიბმული. დამატებითი როლები ბაზაში ინახება.
 */
export const SYSTEM_ROLES = {
  admin: "ადმინისტრატორი",
  registrar: "რეგისტრატორი",
  doctor: "ექიმი",
  nurse: "ექთანი",
  lab: "ლაბორანტი",
  accountant: "ბუღალტერი",
  director: "დირექტორი",
  warehouse: "საწყობის მენეჯერი",
} as const;

export type SystemRoleCode = keyof typeof SYSTEM_ROLES;

export function isSystemRole(code: string): code is SystemRoleCode {
  return Object.hasOwn(SYSTEM_ROLES, code);
}

/** პაციენტის ძებნა, ნახვა, დამატება და დოკუმენტების მიბმა. */
export const PATIENT_ROLES: SystemRoleCode[] = ["registrar", "admin"];

/** ახალი პაციენტის რეგისტრაცია და პაციენტის მიღება (ახალი ვიზიტი). */
export const PATIENT_REGISTRAR_ROLE: SystemRoleCode = "registrar";

/** არსებული პაციენტის მონაცემების შეცვლა და დოკუმენტის წაშლა. */
export const PATIENT_EDITOR_ROLE: SystemRoleCode = "admin";


/** როლის კოდი URL-ის პირველი სეგმენტია: ლათინური პატარა ასოები, ციფრები, ტირე. */
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9-]{1,29}$/;

/** კოდები, რომლებიც სისტემის მარშრუტებს ემთხვევა ან მომავლისთვისაა დაჯავშნილი. */
export const RESERVED_ROLE_CODES = ["login", "logout", "api", "profile", "settings", "static", "public", "chat", "account"];

/** როლის მთავარი გვერდის მისამართი. */
export function rolePath(code: string): string {
  return `/${code}`;
}
