/**
 * ჯავშნების ვალიდაცია, სტატუსები და ტიპები — საერთო კლიენტისა და სერვერისთვის.
 */
import { z } from "zod";
import { isRealDate, type Slot } from "@/lib/appointment-slots";
import { patientSchema } from "@/lib/patient-schema";

export const APPOINTMENT_STATUSES = [
  { value: "booked", label: "დაჯავშნილი" },
  { value: "arrived", label: "მობრძანდა" },
  { value: "in_progress", label: "მიღებაზე" },
  { value: "completed", label: "დასრულებული" },
  { value: "cancelled", label: "გაუქმებული" },
  { value: "no_show", label: "არ გამოცხადდა" },
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]["value"];

export function appointmentStatusLabel(status: string): string {
  return APPOINTMENT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/**
 * რეგისტრატურის სტატუსის მენიუს დასაშვები გადასვლები. გაუქმება ცალკე მოქმედებაა (მიზეზით) და საბოლოოა;
 * შეცდომით შეცვლილი სტატუსი უკან შეიძლება დაბრუნდეს.
 * „მიღებაზე“ და „დასრულებული“ — მხოლოდ ექიმის გვერდიდან (მიღების დაწყება / ვიზიტის დასრულება: ჩანაწერი იკეტება,
 * სერვისები ფინანსებში გადადის), ამიტომ აქ არ არის.
 */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ["arrived", "no_show"],
  arrived: ["booked"],
  in_progress: [],
  completed: [],
  no_show: ["booked"],
  cancelled: [],
};

/** ჯავშნის გაკეთება შეიძლება მაქსიმუმ ამდენი დღით წინ. */
export const BOOKING_HORIZON_DAYS = 365;

/** დღის ჯავშნების სიის გვერდის ზომა. */
export const APPOINTMENTS_PAGE_SIZE = 25;

const id = (message: string) => z.number({ error: message }).int().positive(message);

export const bookingDateSchema = z
  .string()
  .refine(isRealDate, "აირჩიეთ თარიღი");

const startSchema = z.iso.datetime({ offset: true, error: "აირჩიეთ ვიზიტის დრო" });

const comment = z
  .string()
  .trim()
  .max(1000, "კომენტარი ძალიან გრძელია")
  .transform((v) => v || null);

export const slotsQuerySchema = z.object({
  doctorId: id("აირჩიეთ ექიმი"),
  date: bookingDateSchema,
  /** პაციენტის სხვა ჯავშნების მოსანიშნად (არასავალდებულო) */
  patientId: z.number().int().positive().nullable().optional(),
  /** გადატანისას საკუთარი ჯავშანი დაკავებულად არ ითვლება */
  excludeAppointmentId: z.number().int().positive().nullable().optional(),
});

export type SlotsQuery = z.input<typeof slotsQuerySchema>;

export const appointmentSchema = z.object({
  patientId: id("აირჩიეთ პაციენტი"),
  doctorId: id("აირჩიეთ ექიმი"),
  start: startSchema,
  comment,
});

export type AppointmentInput = z.input<typeof appointmentSchema>;

export const rescheduleSchema = z.object({
  appointmentId: z.number().int().positive(),
  start: startSchema,
});

export type RescheduleInput = z.input<typeof rescheduleSchema>;

export const statusChangeSchema = z.object({
  appointmentId: z.number().int().positive(),
  status: z.enum(["booked", "arrived", "no_show"], { error: "სტატუსი არასწორია" }),
});

export type StatusChangeInput = z.input<typeof statusChangeSchema>;

export const appointmentCancelSchema = z.object({
  appointmentId: z.number().int().positive(),
  reason: z.string().trim().min(3, "მიუთითეთ გაუქმების მიზეზი").max(500, "მიზეზი ძალიან გრძელია"),
});

export type AppointmentCancelInput = z.input<typeof appointmentCancelSchema>;

/**
 * ჯავშნისას ახალი პაციენტის სწრაფი რეგისტრაცია: პაციენტის სრული ფორმის იგივე წესები,
 * ოღონდ ტელეფონი სავალდებულოა (ჯავშნის დასადასტურებლად/გასაუქმებლად დასაკავშირებლად).
 */
export const bookingPatientSchema = patientSchema.extend({
  phone: z
    .string()
    .trim()
    .min(1, "შეიყვანეთ ტელეფონი")
    .regex(/^\+?[0-9][0-9 ()-]{4,19}$/, "ტელეფონის ნომერი არასწორია"),
});

export type BookingPatientValues = z.input<typeof bookingPatientSchema>;

/** ჯავშნის ფორმის არჩევანი (სიები პატარაა — გვერდი ერთად ტვირთავს). */
export type SpecialtyOption = { id: number; name: string };
export type BookingDoctor = {
  id: number;
  name: string;
  specialtyId: number;
  specialty: string;
  room: string | null;
  duration: number;
  /** სამუშაო დღეები (1 — ორშაბათი ... 7 — კვირა) */
  weekdays: number[];
};

/** ნაპოვნი/არჩეული პაციენტი. */
export type BookingPatient = {
  id: number;
  personalId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string;
  /** ვალი ღია ინვოისებზე (ძებნიდან; ახლად დარეგისტრირებულს — არ აქვს) */
  debt?: string;
};

export type SlotsResult =
  | { ok: true; slots: Slot[]; duration: number; dayOff: boolean }
  | { ok: false; error: string };

/** ჯავშანი დღის სიისთვის (დრო უკვე თბილისის დროით ფორმატირებული). */
export type AppointmentRow = {
  id: number;
  start: string;
  end: string;
  date: string;
  patient: { id: number; name: string; personalId: string; phone: string | null };
  doctor: { id: number; name: string; specialty: string; room: string | null };
  status: AppointmentStatus;
  comment: string | null;
  cancelReason: string | null;
  createdBy: string | null;
  /** გასულია (გადატანა/„მობრძანდა“ ჯერ კიდევ შეიძლება — მაგ. დაგვიანებით მოსულზე) */
  isPast: boolean;
  /** ჯავშნის (გაუქმებელი) ინვოისი */
  invoice: { id: number; number: string } | null;
};
