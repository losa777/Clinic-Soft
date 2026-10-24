"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Package, X } from "lucide-react";
import { SearchPicker } from "@/components/search-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatQuantity, inputQuantity, parseQuantity } from "@/modules/inventory/stock";

/** საწყობის დასახელება ფორმისთვის: usable — ვარგისი ნაშთი (მეასედებში). */
export type MaterialItem = { id: number; name: string; unit: string; usable: number };
/** ნორმის ხაზი (მეასედებში). */
export type MaterialNorm = { itemId: number; quantity: number };
export type MaterialLine = { itemId: number; quantity: string };

export const linesFromNorm = (norm: MaterialNorm[]): MaterialLine[] => norm.map((n) => ({ itemId: n.itemId, quantity: inputQuantity(n.quantity) }));

/**
 * „გამოყენებული მასალა“ შესრულების ფორმაში: ნორმიდან წინასწარ შევსებული, რაოდენობა იცვლება, ხაზი იშლება/ემატება.
 * ცარიელი სია — მასალა არ ჩამოიწერება. ნაშთზე მეტი — წითლად (სერვერიც შეამოწმებს).
 */
export function MaterialsEditor({
  items,
  value,
  onChange,
  disabled,
}: {
  items: MaterialItem[];
  value: MaterialLine[];
  onChange: (lines: MaterialLine[]) => void;
  disabled?: boolean;
}) {
  const pickerId = useId();
  const [open, setOpen] = useState(false);
  const byId = new Map(items.map((i) => [i.id, i]));
  const used = new Set(value.map((l) => l.itemId));
  const summary = value
    .map((l) => {
      const item = byId.get(l.itemId);
      return item ? `${item.name} × ${l.quantity}` : null;
    })
    .filter(Boolean)
    .join(", ");
  const short = value.some((l) => {
    const q = parseQuantity(l.quantity);
    return q === null || q > (byId.get(l.itemId)?.usable ?? 0);
  });

  return (
    <div className={cn("w-full rounded-lg border bg-muted/20 text-sm", short && "border-destructive/50")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <Package className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">გამოყენებული მასალა</span>
        <span className={cn("min-w-0 flex-1 truncate text-xs text-muted-foreground", short && "text-destructive")}>
          {value.length ? summary : "არ ჩამოიწერება"}
          {short && " · ნაშთი არ ჰყოფნის"}
        </span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t px-3 py-2">
          {value.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {value.map((l) => {
                const item = byId.get(l.itemId);
                const q = parseQuantity(l.quantity);
                const lacking = q === null || q > (item?.usable ?? 0);
                return (
                  <li key={l.itemId} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-36 flex-1">{item?.name ?? "გათიშული დასახელება"}</span>
                    <Input
                      aria-label={`რაოდენობა — ${item?.name ?? ""}`}
                      value={l.quantity}
                      onChange={(e) => onChange(value.map((x) => (x.itemId === l.itemId ? { ...x, quantity: e.target.value } : x)))}
                      inputMode="decimal"
                      aria-invalid={lacking}
                      disabled={disabled}
                      className="h-7 w-20 tabular-nums"
                    />
                    <span className={cn("w-32 text-xs text-muted-foreground", lacking && "text-destructive")}>
                      {item?.unit} · ნაშთი {formatQuantity(item?.usable ?? 0)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onChange(value.filter((x) => x.itemId !== l.itemId))}
                      aria-label={`ამოღება — ${item?.name ?? ""}`}
                      disabled={disabled}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <SearchPicker
            id={pickerId}
            items={items.filter((i) => !used.has(i.id)).map((i) => ({ id: i.id, label: i.name, detail: `${formatQuantity(i.usable)} ${i.unit}` }))}
            onSelect={(p) => onChange([...value, { itemId: p.id, quantity: "1" }])}
            placeholder="დაამატეთ მასალა"
          />
        </div>
      )}
    </div>
  );
}
