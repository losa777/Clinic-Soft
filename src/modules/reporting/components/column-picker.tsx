"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveColumnsAction } from "@/modules/reporting/actions";
import { COLUMN_GROUPS, type ColumnKey, EXPORT_COLUMNS } from "@/modules/reporting/columns";

/** მონიშვნიდან შენახვამდე (რამდენიმე ზედიზედ მონიშვნა — ერთი შენახვა). */
const SAVE_DELAY_MS = 600;

/**
 * სვეტების არჩევა ჯგუფებად: მონიშვნა მაშინვე ინახება (მომხმარებელზე — შემდეგ შესვლაზეც რჩება) და წინასწარი ცხრილი
 * ახლდება. ჯგუფზე — „ყველა / არცერთი“. Excel-იც (ორივე გვერდიდან) ამ სვეტებით გადის.
 */
export function ColumnPicker({ initial }: { initial: ColumnKey[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<ColumnKey>>(() => new Set(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function save(next: Set<ColumnKey>) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // ცხრილის რიგით (Excel-ის სვეტების რიგი)
      const columns = EXPORT_COLUMNS.filter((c) => next.has(c.key)).map((c) => c.key);
      startSaving(async () => {
        try {
          const res = await saveColumnsAction(columns);
          if (!res.ok) return void toast.error(res.error ?? "სვეტები ვერ შეინახა");
          setDirty(false);
          router.refresh();
        } catch {
          toast.error("სვეტები ვერ შეინახა. სცადეთ თავიდან");
        }
      });
    }, SAVE_DELAY_MS);
  }

  function setMany(keys: ColumnKey[], on: boolean) {
    const next = new Set(selected);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    // ბოლო სვეტი არ მოიხსნება — ცარიელი Excel აზრს მოკლებულია
    if (!next.size) return void toast.info("ერთი სვეტი მაინც უნდა იყოს მონიშნული");
    setSelected(next);
    setDirty(true);
    save(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        {saving || dirty ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            ინახება...
          </>
        ) : (
          <>
            <Check className="size-3.5 text-emerald-600" />
            მონიშნულია {selected.size} სვეტი — შენახულია, შემდეგ შესვლაზეც დარჩება
          </>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COLUMN_GROUPS.map((g) => {
          const columns = EXPORT_COLUMNS.filter((c) => c.group === g.value);
          const keys = columns.map((c) => c.key);
          const all = keys.every((k) => selected.has(k));
          return (
            <fieldset key={g.value} className="flex flex-col gap-1.5 rounded-lg border p-3">
              <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-medium">
                {g.label}
                <button type="button" className="text-xs font-normal text-primary hover:underline" onClick={() => setMany(keys, !all)}>
                  {all ? "არცერთი" : "ყველა"}
                </button>
              </legend>
              {columns.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(c.key)}
                    onChange={(e) => setMany([c.key], e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  {c.label}
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
