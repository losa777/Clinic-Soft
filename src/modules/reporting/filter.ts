import { param, periodParams, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";

/**
 * ანგარიშგების ფილტრი (URL-ში — ბმული/განახლება ინარჩუნებს; ექსპორტის მისამართიც იგივე პარამეტრებით).
 * scope: surgical — მხოლოდ საოპერაციო (ნაგულისხმევი), all — ყველა ვიზიტი (მხოლოდ reporting.all_patients-ით).
 * ids — მთავარ გვერდზე მონიშნული ვიზიტები (Excel — მონიშნული): პერიოდი/სტატუსი მაშინ აღარ მოქმედებს.
 * სვეტები URL-ში არ არის — მომხმარებლის შენახული არჩევანია (server/templates.ts: loadColumns).
 */
export type ReportScope = "surgical" | "all";
export type PortalFilter = "pending" | "uploaded" | "all";

export type ReportFilter = {
  from: string;
  to: string;
  scope: ReportScope;
  portal: PortalFilter;
  doctorId: number | null;
  ids: number[] | null;
};

export const PORTAL_OPTIONS: { value: PortalFilter; label: string }[] = [
  { value: "pending", label: "ასატვირთი" },
  { value: "uploaded", label: "ატვირთული" },
  { value: "all", label: "ყველა" },
];

export const SCOPE_OPTIONS: { value: ReportScope; label: string }[] = [
  { value: "surgical", label: "მხოლოდ საოპერაციო" },
  { value: "all", label: "ყველა ვიზიტი" },
];

/** ერთ ექსპორტში მონიშნული ვიზიტების მაქსიმუმი. */
export const EXPORT_IDS_MAX = 1000;

/** ?ids=1,2,3 → ვიზიტების id (დადებითი, უნიკალური, მაქს. EXPORT_IDS_MAX); არაფერი — null. */
export function parseIds(value: string | string[] | undefined): number[] | null {
  const raw = typeof value === "string" ? value : "";
  const ids = [...new Set(raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, EXPORT_IDS_MAX);
  return ids.length ? ids : null;
}

export function parseFilter(params: SearchParams, allPatients: boolean): ReportFilter {
  const portal = param(params.portal);
  return {
    ...periodParams(params, 30),
    scope: allPatients && param(params.scope) === "all" ? "all" : "surgical",
    portal: portal === "uploaded" || portal === "all" ? portal : "pending",
    doctorId: positiveInt(params.doctor),
    // param() ჭრის 100 სიმბოლოზე — მონიშნულების სია გრძელია
    ids: parseIds(params.ids),
  };
}

/** ფილტრი → URL პარამეტრები (ბმულებისთვის). */
export function filterQuery(f: ReportFilter): Record<string, string | number | null> {
  return { from: f.from, to: f.to, scope: f.scope === "all" ? "all" : null, portal: f.portal, doctor: f.doctorId };
}

export const EXPORT_URL = "/api/reporting/export";

/** Excel-ის ბმული: ფილტრით (ყველა შესაბამისი ვიზიტი). */
export const exportUrl = (f: ReportFilter) => withParams(EXPORT_URL, filterQuery(f));
