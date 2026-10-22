"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchIcd10Action } from "@/modules/emr/actions/profile-actions";
import type { Icd10Option } from "@/modules/emr/server/icd10";

const DEBOUNCE_MS = 300;

/**
 * ICD-10-ის ძებნა სერვერზე (კოდით ან დასახელებით, მაქს. 20). არჩევისას სია იხურება და ველი სუფთავდება.
 * დიაგნოზისა და ქრონიკული დაავადების ფორმებში.
 */
export function Icd10Picker({
  id,
  onSelect,
  placeholder = "ICD-10: კოდი (I10) ან დასახელება",
  invalid,
  disabled,
}: {
  id: string;
  onSelect: (option: Icd10Option) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; rows: Icd10Option[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      searchIcd10Action(q)
        .then((rows) => current && setFound({ q, rows }))
        .catch(() => current && setFound({ q, rows: [] }));
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q]);

  const rows = q.length >= 2 && found ? found.rows : [];
  const loading = q.length >= 2 && found?.q !== q;

  function select(option: Icd10Option) {
    onSelect(option);
    setQuery("");
    setOpen(false);
    setActive(0);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (rows.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && rows[active]) select(rows[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 pr-8 pl-8"
      />
      {loading && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && q.length >= 2 && !loading && (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg bg-popover p-1 text-sm shadow-md ring-1 ring-foreground/10">
          {rows.length === 0 && <li className="px-2 py-2 text-muted-foreground">ვერაფერი მოიძებნა</li>}
          {rows.map((r, i) => (
            <li
              key={r.code}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(r)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer gap-3 rounded-md px-2 py-1.5", i === active && "bg-accent text-accent-foreground")}
            >
              <span className="w-14 shrink-0 font-mono font-medium">{r.code}</span>
              <span className="min-w-0">
                {r.nameKa}
                {r.nameEn && r.nameEn !== r.nameKa && <span className="block truncate text-xs text-muted-foreground">{r.nameEn}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
