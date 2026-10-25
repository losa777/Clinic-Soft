"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { SearchPicker } from "@/components/search-picker";
import { Badge } from "@/components/ui/badge";

/**
 * ექიმის ფილტრი GET ფორმაში (ანგარიშგება): ძებნა სახელით, გვარით ან სპეციალობით; არჩევა/მოხსნა ფორმას მაშინვე აგზავნის.
 * მნიშვნელობა — დამალული ველი name="doctor".
 */
export function DoctorFilter({ doctors, value }: { doctors: { id: number; name: string; specialty: string }[]; value: number | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [doctorId, setDoctorId] = useState(value);
  const selected = doctors.find((d) => d.id === doctorId) ?? null;

  function choose(id: number | null) {
    setDoctorId(id);
    if (!input.current) return;
    // ველი პირდაპირ — state-ის განახლებას ფორმის გაგზავნამდე არ ველოდებით
    input.current.value = id ? String(id) : "";
    input.current.form?.requestSubmit();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="hidden" name="doctor" defaultValue={value ?? ""} />
      <div className="w-72">
        <SearchPicker
          id="reporting-doctor"
          items={doctors.map((d) => ({ id: d.id, label: d.name, detail: d.specialty || undefined, keywords: d.specialty }))}
          onSelect={(item) => choose(item.id)}
          placeholder={selected ? `${selected.name} — შეცვლა` : "სახელი, გვარი ან სპეციალობა"}
          emptyText="ექიმი ვერ მოიძებნა"
          closeOnSelect
        />
      </div>
      {selected ? (
        <Badge variant="secondary" className="h-9 gap-1.5 px-3 text-sm">
          {selected.name}
          {selected.specialty && <span className="text-muted-foreground">· {selected.specialty}</span>}
          <button
            type="button"
            onClick={() => choose(null)}
            className="-mr-1 rounded-sm text-muted-foreground hover:text-foreground"
            aria-label="ფილტრის მოხსნა — ყველა ექიმი"
            title="ყველა ექიმი"
          >
            <X className="size-3.5" />
          </button>
        </Badge>
      ) : (
        <span className="text-sm text-muted-foreground">ყველა ექიმი</span>
      )}
    </div>
  );
}
