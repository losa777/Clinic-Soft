"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BOOLEAN_LABELS,
  type MeasurementDef,
  measurementFlag,
  measurementKey,
  normalText,
  parseMeasurement,
  type SideCode,
  sidesOf,
} from "@/modules/emr/measurements";

/** ფორმის შეცდომები: გასაღები → ტექსტი (ცარიელი ობიექტი — ყველაფერი სწორია). */
export function measurementErrors(defs: MeasurementDef[], values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const d of defs) {
    for (const { side } of sidesOf(d.sides)) {
      const key = measurementKey(d.id, side);
      const r = parseMeasurement(d, values[key] ?? "");
      if (!r.ok) errors[key] = r.error;
    }
  }
  return errors;
}

/**
 * სპეციალობის მაჩვენებლები (ადმინი ამატებს სპეციალობის მიხედვით): ერთმნიშვნელოვანი — ბადეში,
 * ორმხრივი (OD/OS, მარჯვ./მარცხ.) — ცხრილში. რიცხვზე — ნორმიდან გადახრის ნიშანი (↑/↓).
 */
export function MeasurementsPanel({
  defs,
  values,
  errors,
  disabled,
  onChange,
}: {
  defs: MeasurementDef[];
  values: Record<string, string>;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  if (!defs.length) return null;
  const single = defs.filter((d) => d.sides === "none");
  const sided = defs.filter((d) => d.sides !== "none");
  const field = (d: MeasurementDef, side: SideCode, label?: string) => {
    const key = measurementKey(d.id, side);
    return (
      <MeasurementInput
        key={key}
        id={`m-${key}`}
        def={d}
        label={label}
        value={values[key] ?? ""}
        error={errors[key]}
        disabled={disabled}
        onChange={(v) => onChange(key, v)}
      />
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>სპეციალობის მაჩვენებლები</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {single.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {single.map((d) => (
              <div key={d.id} className="flex flex-col gap-1">
                <MeasurementLabel def={d} htmlFor={`m-${measurementKey(d.id, "none")}`} />
                {field(d, "none")}
              </div>
            ))}
          </div>
        )}
        {sided.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-1 text-left font-medium" />
                  {/* სვეტების სათაურები — პირველი ორმხრივი მაჩვენებლის მიხედვით (თვალი: OD/OS) */}
                  {sidesOf(sided[0].sides).map((s) => (
                    <th key={s.side} className="pb-1 text-left font-medium">
                      {sided.every((d) => d.sides === sided[0].sides) ? s.label : s.side === "right" ? "მარჯვ. / OD" : "მარცხ. / OS"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sided.map((d) => (
                  <tr key={d.id} className="border-t align-top">
                    <td className="py-1.5 pr-3">
                      <MeasurementLabel def={d} />
                    </td>
                    {sidesOf(d.sides).map((s) => (
                      <td key={s.side} className="py-1.5 pr-2">
                        {field(d, s.side, `${d.name} ${s.label}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MeasurementLabel({ def: d, htmlFor }: { def: MeasurementDef; htmlFor?: string }) {
  const normal = normalText(d);
  return (
    <label htmlFor={htmlFor} className="text-sm">
      {d.name}
      {d.required && <span className="text-destructive"> *</span>}
      {(d.unit || normal) && (
        <span className="block text-xs text-muted-foreground">
          {[d.unit, normal && `ნორმა ${normal}`].filter(Boolean).join(" · ")}
        </span>
      )}
    </label>
  );
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

function MeasurementInput({
  id,
  def: d,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  def: MeasurementDef;
  label?: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const common = { id, disabled, "aria-invalid": error ? true : undefined, "aria-label": label };
  let control: React.ReactNode;
  if (d.type === "select") {
    control = (
      <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">—</option>
        {/* მნიშვნელობა, რომელიც ვარიანტებიდან ამოიღეს — მაინც ჩანს */}
        {value && !d.options.includes(value) && <option value={value}>{value}</option>}
        {d.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (d.type === "boolean") {
    control = (
      <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">—</option>
        <option value="yes">{BOOLEAN_LABELS.yes}</option>
        <option value="no">{BOOLEAN_LABELS.no}</option>
      </select>
    );
  } else {
    const parsed = d.type === "number" && !error && value.trim() ? Number(value.replace(",", ".")) : null;
    const flag = measurementFlag(d, parsed);
    control = (
      <div className="relative">
        <Input
          {...common}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={d.type === "number" ? "decimal" : undefined}
          maxLength={d.type === "text" ? 500 : 20}
          className={cn("h-9", flag === "high" || flag === "low" ? "border-amber-500 pr-7" : "")}
        />
        {flag === "high" && <ArrowUp className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-amber-600" aria-label="ნორმაზე მაღალი" />}
        {flag === "low" && <ArrowDown className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-amber-600" aria-label="ნორმაზე დაბალი" />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {control}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
