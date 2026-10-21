"use client";

import { cn } from "@/lib/utils";

/** რამდენიმე ვარიანტიდან ერთის არჩევა ღილაკების ჯგუფით (radio-ს სემანტიკით). */
export function SegmentedChoice<T extends string>({
  id,
  items,
  value,
  onChange,
  invalid,
}: {
  id: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  invalid?: boolean;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-invalid={invalid ? true : undefined}
      className={cn(
        "grid h-10 auto-cols-fr grid-flow-col gap-1 rounded-lg border bg-muted/50 p-1",
        invalid && "border-destructive",
      )}
    >
      {items.map((item) => (
        <label
          key={item.value}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring/50 hover:text-foreground",
            value === item.value && "bg-background text-foreground shadow-sm",
          )}
        >
          <input
            type="radio"
            name={id}
            value={item.value}
            checked={value === item.value}
            onChange={() => onChange(item.value)}
            className="sr-only"
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}
