/**
 * სპეციალობის მაჩვენებლები (ადმინი ამატებს სპეციალობის მიხედვით, რაოდენობა შეუზღუდავია): ტიპები, მნიშვნელობის
 * შემოწმება, ნორმიდან გადახრა, ჩვენება. სუფთა მოდული — ფორმაში (მყისიერი შემოწმება), სერვერზე (ვალიდაცია) და ტესტებში.
 */
import { z } from "zod";

export type MeasurementTypeCode = "number" | "text" | "select" | "boolean";
export type SidesCode = "none" | "eyes" | "limbs";
export type SideCode = "none" | "right" | "left";

export const MEASUREMENT_TYPES: { value: MeasurementTypeCode; label: string }[] = [
  { value: "number", label: "რიცხვი" },
  { value: "text", label: "ტექსტი" },
  { value: "select", label: "არჩევანი სიიდან" },
  { value: "boolean", label: "კი / არა" },
];

export const MEASUREMENT_SIDES: { value: SidesCode; label: string }[] = [
  { value: "none", label: "ერთი მნიშვნელობა" },
  { value: "eyes", label: "ორივე თვალი (OD / OS)" },
  { value: "limbs", label: "მარჯვენა / მარცხენა" },
];

/** ერთი მაჩვენებლის აღწერა (ფორმისთვის): რიცხვები — number, ვარიანტები — მასივი. */
export type MeasurementDef = {
  id: number;
  name: string;
  unit: string | null;
  type: MeasurementTypeCode;
  sides: SidesCode;
  min: number | null;
  max: number | null;
  normalMin: number | null;
  normalMax: number | null;
  decimals: number;
  options: string[];
  required: boolean;
};

/** მხარეები და მათი წარწერები (თვალები — OD/OS). */
export function sidesOf(sides: SidesCode): { side: SideCode; label: string }[] {
  if (sides === "eyes") return [{ side: "right", label: "OD" }, { side: "left", label: "OS" }];
  if (sides === "limbs") return [{ side: "right", label: "მარჯვ." }, { side: "left", label: "მარცხ." }];
  return [{ side: "none", label: "" }];
}

/** ფორმის მნიშვნელობის გასაღები: "<definitionId>:<side>". */
export const measurementKey = (definitionId: number, side: SideCode) => `${definitionId}:${side}`;
export const MEASUREMENT_KEY = /^(\d{1,9}):(none|right|left)$/;

export const BOOLEAN_LABELS = { yes: "კი", no: "არა" } as const;

export type ParsedValue = { num: number | null; text: string | null };

/**
 * ფორმის ტექსტი → შესანახი მნიშვნელობა ან შეცდომა. ცარიელი — null (არ ინახება).
 * number: მძიმეც მიიღება, დასაშვები ფარგლები და ათწილადები; select — მხოლოდ ვარიანტებიდან; boolean — "yes"/"no".
 */
export function parseMeasurement(def: MeasurementDef, raw: string): { ok: true; value: ParsedValue | null } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  switch (def.type) {
    case "number": {
      const t = s.replace(",", ".");
      if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return { ok: false, error: "შეიყვანეთ რიცხვი" };
      const n = Number(t);
      if ((def.min !== null && n < def.min) || (def.max !== null && n > def.max)) {
        return { ok: false, error: `${def.min ?? "…"}–${def.max ?? "…"}${def.unit ? ` ${def.unit}` : ""}` };
      }
      const factor = 10 ** def.decimals;
      if (Math.abs(Math.round(n * factor) - n * factor) > 1e-6) return { ok: false, error: def.decimals ? `მაქს. ${def.decimals} ათწილადი` : "მთელი რიცხვი" };
      return { ok: true, value: { num: n, text: null } };
    }
    case "select":
      return def.options.includes(s) ? { ok: true, value: { num: null, text: s } } : { ok: false, error: "აირჩიეთ სიიდან" };
    case "boolean":
      return s === "yes" || s === "no" ? { ok: true, value: { num: null, text: s } } : { ok: false, error: "კი ან არა" };
    default:
      return s.length > 500 ? { ok: false, error: "მაქს. 500 სიმბოლო" } : { ok: true, value: { num: null, text: s } };
  }
}

/** შენახული მნიშვნელობა → ფორმის ტექსტი. */
export function rawOf(def: Pick<MeasurementDef, "type" | "decimals">, v: { num: number | null; text: string | null }): string {
  if (def.type === "number") return v.num === null ? "" : v.num.toFixed(def.decimals);
  return v.text ?? "";
}

export type Flag = "low" | "high" | "normal";

/** ნორმიდან გადახრა (მხოლოდ რიცხვზე, თუ ნორმა მითითებულია). */
export function measurementFlag(def: Pick<MeasurementDef, "type" | "normalMin" | "normalMax">, num: number | null): Flag | null {
  if (def.type !== "number" || num === null || Number.isNaN(num) || (def.normalMin === null && def.normalMax === null)) return null;
  if (def.normalMin !== null && num < def.normalMin) return "low";
  if (def.normalMax !== null && num > def.normalMax) return "high";
  return "normal";
}

/** ნორმის ტექსტი: „10–21“, „≤ 5.2“, „≥ 0.8“. */
export function normalText(def: Pick<MeasurementDef, "normalMin" | "normalMax">): string | null {
  if (def.normalMin !== null && def.normalMax !== null) return `${def.normalMin}–${def.normalMax}`;
  if (def.normalMax !== null) return `≤ ${def.normalMax}`;
  if (def.normalMin !== null) return `≥ ${def.normalMin}`;
  return null;
}

/** ჩვენება (ისტორია, დოკუმენტები): „თვალშიდა წნევა (T) OD: 15.0 მმ Hg“. */
export function formatMeasurement(def: Pick<MeasurementDef, "name" | "unit" | "type" | "decimals" | "sides">, side: SideCode, v: ParsedValue): string {
  const label = sidesOf(def.sides).find((s) => s.side === side)?.label;
  const value =
    def.type === "number"
      ? `${v.num?.toFixed(def.decimals)}${def.unit ? ` ${def.unit}` : ""}`
      : def.type === "boolean"
        ? BOOLEAN_LABELS[v.text as "yes" | "no"] ?? v.text
        : v.text;
  return `${def.name}${label ? ` ${label}` : ""}: ${value}`;
}

// ─── ადმინის ფორმა: მაჩვენებლის შექმნა / რედაქტირება ───

const optionalNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => v === "" || /^[-+]?\d+(\.\d+)?$/.test(v), "შეიყვანეთ რიცხვი")
  .transform((v) => (v === "" ? null : Number(v)));

export const definitionSchema = z
  .object({
    name: z.string().trim().min(1, "შეიყვანეთ დასახელება").max(150, "მაქს. 150 სიმბოლო"),
    unit: z
      .string()
      .trim()
      .max(30, "მაქს. 30 სიმბოლო")
      .transform((v) => v || null),
    type: z.enum(["number", "text", "select", "boolean"]),
    sides: z.enum(["none", "eyes", "limbs"]),
    min: optionalNumber,
    max: optionalNumber,
    normalMin: optionalNumber,
    normalMax: optionalNumber,
    decimals: z.number().int().min(0, "0–4").max(4, "0–4"),
    /** ვარიანტები — თითო სტრიქონზე ერთი */
    options: z
      .string()
      .max(5000)
      .transform((v) => [...new Set(v.split("\n").map((o) => o.trim()).filter(Boolean))]),
  })
  .refine((v) => v.type !== "select" || v.options.length >= 2, { path: ["options"], message: "მინიმუმ 2 ვარიანტი" })
  .refine((v) => v.options.every((o) => o.length <= 100), { path: ["options"], message: "ვარიანტი — მაქს. 100 სიმბოლო" })
  .refine((v) => v.min === null || v.max === null || v.min < v.max, { path: ["max"], message: "მაქსიმუმი მინიმუმზე მეტი უნდა იყოს" })
  .refine((v) => v.normalMin === null || v.normalMax === null || v.normalMin <= v.normalMax, {
    path: ["normalMax"],
    message: "ნორმის ზედა ზღვარი ქვედაზე ნაკლებია",
  });
export type DefinitionInput = z.input<typeof definitionSchema>;
