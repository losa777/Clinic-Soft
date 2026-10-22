/**
 * უფლებები: კოდი → ქართული აღწერა. ბაზაში (permissions) იწერება `npm run db:setup`-ით, როლებს ენიჭება
 * ადმინის პანელიდან („როლები“ → „უფლებები“). ადმინისტრატორს ყოველთვის ყველა უფლება აქვს.
 * შემოწმება ყოველთვის სერვერზე: requirePermission (src/lib/dal.ts).
 */
import type { SystemRoleCode } from "@/lib/roles";

export const PERMISSIONS = {
  "services.view": "სერვისების და ფასების ნახვა",
  "services.manage": "სერვისების, ფასების და კატეგორიების მართვა",
  "invoices.view": "ინვოისების ნახვა",
  "invoices.create": "ინვოისის შექმნა, პაციენტის პოლისის დამატება",
  "invoices.cancel": "ინვოისის გაუქმება",
  "payments.create": "გადახდის მიღება, ქვითრის ბეჭდვა",
  "payments.refund": "თანხის დაბრუნება",
  "cash.shift": "სალაროს ცვლის გახსნა და დახურვა",
  "reports.daily": "დღის ანგარიში",
  "reports.debts": "დავალიანებები (პაციენტების და სადაზღვევოების)",
  "insurance.manage": "სადაზღვევო კომპანიების და პირობების მართვა",
  "appointments.manage": "ჯავშნების მართვა (სტატუსი, გადატანა, გაუქმება)",
  "appointments.book": "ახალი ჯავშნის შექმნა (მიმართვა, განმეორებითი ვიზიტი)",
  "emr.view": "სამედიცინო ჩანაწერის ნახვა (ბარათი, ისტორია, კვლევები)",
  "emr.edit": "ვიზიტის ფორმა, დიაგნოზი, დანიშნულებები — საკუთარ ვიზიტებზე",
  "documents.sign": "სამედიცინო დოკუმენტის შექმნა და ხელმოწერა",
  "orders.lab": "ლაბორატორიული და ინსტრუმენტული კვლევების შესრულება",
  "orders.nurse": "ექთნის პროცედურების შესრულება",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

/** როლი, რომელსაც ყველა უფლება აქვს და ვერ ჩამოერთმევა (თავის ჩაკეტვისგან დაცვა). */
export const FULL_ACCESS_ROLE: SystemRoleCode = "admin";

const VIEW_AND_REPORTS: PermissionCode[] = ["services.view", "invoices.view", "reports.daily", "reports.debts"];

/**
 * ნაგულისხმევი მინიჭება: ახალი უფლება ბაზაში დამატებისას ამ როლებს ავტომატურად ენიჭება
 * (უკვე არსებულ მინიჭებას db:setup არ ცვლის — ადმინის ცვლილებები რჩება).
 */
export const DEFAULT_ROLE_PERMISSIONS: Partial<Record<SystemRoleCode, PermissionCode[]>> = {
  admin: ALL_PERMISSIONS,
  // სამედიცინო ჩანაწერზე რეგისტრატურას წვდომა არ აქვს
  registrar: [
    ...VIEW_AND_REPORTS,
    "invoices.create",
    "invoices.cancel",
    "payments.create",
    "cash.shift",
    "appointments.manage",
    "appointments.book",
  ],
  doctor: ["services.view", "emr.view", "emr.edit", "documents.sign", "appointments.book"],
  lab: ["orders.lab"],
  nurse: ["orders.nurse"],
  accountant: VIEW_AND_REPORTS,
  director: VIEW_AND_REPORTS,
};

export function isPermission(code: string): code is PermissionCode {
  return Object.hasOwn(PERMISSIONS, code);
}

/** სესიის მომხმარებელს აქვს თუ არა უფლება (UI-ში ღილაკების საჩვენებლად; სერვერზე — requirePermission). */
export function can(user: { roleCode: string; permissions: string[] }, code: PermissionCode): boolean {
  return user.roleCode === FULL_ACCESS_ROLE || user.permissions.includes(code);
}
