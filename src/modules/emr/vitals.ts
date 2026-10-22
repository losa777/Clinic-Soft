/**
 * ვიტალური მაჩვენებლები: დასაშვები დიაპაზონი (შეყვანის შეცდომისგან დაცვა), ზრდასრულის ნორმა (გადახრის მონიშვნა), BMI.
 * სუფთა ფუნქციებია — ფორმაში (მყისიერი მონიშვნა) და სერვერზე (ვალიდაცია) ერთნაირად მუშაობს.
 * ნორმა ზრდასრულისაა; ბავშვის ასაკობრივი ნორმები ჯერ არ არის გათვალისწინებული.
 */

export type VitalKey = "bpSystolic" | "bpDiastolic" | "pulse" | "temperature" | "spo2" | "respRate" | "weightKg" | "heightCm";

type VitalSpec = {
  label: string;
  unit: string;
  /** შეყვანის დასაშვები დიაპაზონი (ფიზიოლოგიურად შესაძლებელი) */
  min: number;
  max: number;
  /** ათწილადი ნიშნები (0 — მთელი რიცხვი) */
  decimals: number;
  /** ზრდასრულის ნორმა; null — ნორმა არ აქვს (წონა, სიმაღლე) */
  normal: [number, number] | null;
};

export const VITALS: Record<VitalKey, VitalSpec> = {
  bpSystolic: { label: "სისტოლური წნევა", unit: "მმ Hg", min: 40, max: 300, decimals: 0, normal: [90, 139] },
  bpDiastolic: { label: "დიასტოლური წნევა", unit: "მმ Hg", min: 20, max: 200, decimals: 0, normal: [60, 89] },
  pulse: { label: "პულსი", unit: "/წთ", min: 20, max: 300, decimals: 0, normal: [60, 100] },
  temperature: { label: "ტემპერატურა", unit: "°C", min: 30, max: 45, decimals: 1, normal: [36.0, 37.2] },
  spo2: { label: "სატურაცია (SpO₂)", unit: "%", min: 50, max: 100, decimals: 0, normal: [95, 100] },
  respRate: { label: "სუნთქვის სიხშირე", unit: "/წთ", min: 5, max: 80, decimals: 0, normal: [12, 20] },
  weightKg: { label: "წონა", unit: "კგ", min: 0.5, max: 500, decimals: 1, normal: null },
  heightCm: { label: "სიმაღლე", unit: "სმ", min: 30, max: 260, decimals: 1, normal: null },
};

export const VITAL_KEYS = Object.keys(VITALS) as VitalKey[];

export type Flag = "low" | "high" | "normal";

/** ნორმიდან გადახრა; null — მნიშვნელობა არ არის ან ნორმა არ აქვს. */
export function vitalFlag(key: VitalKey, value: number | null): Flag | null {
  const normal = VITALS[key].normal;
  if (value === null || !normal) return null;
  if (value < normal[0]) return "low";
  if (value > normal[1]) return "high";
  return "normal";
}

/** "36,6" / "36.6" / "" → რიცხვი ან null; არასწორი ტექსტი → NaN (ვალიდაცია ამას შეცდომად აჩვენებს). */
export function parseVital(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

/** დიაპაზონისა და ათწილადების შემოწმება: შეცდომის ტექსტი ან null. */
export function checkVital(key: VitalKey, value: number | null): string | null {
  if (value === null) return null;
  const s = VITALS[key];
  if (Number.isNaN(value)) return "შეიყვანეთ რიცხვი";
  if (value < s.min || value > s.max) return `${s.min}–${s.max} ${s.unit}`;
  const factor = 10 ** s.decimals;
  // float-ის ცდომილება (37.3 × 10 = 373.00000000000006) — მცირე ტოლერანტობით
  if (Math.abs(Math.round(value * factor) - value * factor) > 1e-6) return s.decimals ? `მაქს. ${s.decimals} ათწილადი` : "მთელი რიცხვი";
  return null;
}

export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

export const BMI_LABELS: Record<BmiCategory, string> = {
  underweight: "წონის დეფიციტი",
  normal: "ნორმა",
  overweight: "ჭარბი წონა",
  obese: "სიმსუქნე",
};

/** BMI = წონა (კგ) / სიმაღლე (მ)², ერთი ათწილადით; WHO-ს კატეგორია. */
export function bmi(weightKg: number | null, heightCm: number | null): { value: number; category: BmiCategory } | null {
  if (!weightKg || !heightCm || Number.isNaN(weightKg) || Number.isNaN(heightCm)) return null;
  const value = Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
  const category: BmiCategory = value < 18.5 ? "underweight" : value < 25 ? "normal" : value < 30 ? "overweight" : "obese";
  return { value, category };
}
