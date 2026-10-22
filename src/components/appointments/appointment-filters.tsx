"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, isRealDate } from "@/lib/appointment-slots";

/**
 * დღის ჯავშნების ფილტრი: თარიღი (წინა/შემდეგი დღე) და ექიმი — მისამართის ?date=&doctor= პარამეტრებით.
 * ექიმი იძებნება სახელით, გვარით ან სპეციალობით.
 */
export function AppointmentFilters({
  action,
  date,
  today,
  doctorId,
  doctors,
}: {
  action: string;
  date: string;
  today: string;
  doctorId: number | null;
  doctors: { id: number; name: string; specialty: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(next: { date?: string; doctorId?: number | null }) {
    const params = new URLSearchParams();
    const d = next.date ?? date;
    const doctor = next.doctorId === undefined ? doctorId : next.doctorId;
    if (d !== today) params.set("date", d);
    if (doctor) params.set("doctor", String(doctor));
    const qs = params.toString();
    // ფილტრის შეცვლისას გვერდი პირველზე ბრუნდება (page პარამეტრი არ გადადის)
    startTransition(() => router.replace(qs ? `${action}?${qs}` : action, { scroll: false }));
  }

  const items = useMemo<PickerItem[]>(
    () => doctors.map((d) => ({ id: d.id, label: d.name, detail: d.specialty, keywords: d.specialty })),
    [doctors],
  );
  const selected = doctors.find((d) => d.id === doctorId) ?? null;

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-lg" onClick={() => go({ date: addDays(date, -1) })} aria-label="წინა დღე">
          <ChevronLeft />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => isRealDate(e.target.value) && go({ date: e.target.value })}
          aria-label="თარიღი"
          className="h-9 w-44"
        />
        <Button variant="outline" size="icon-lg" onClick={() => go({ date: addDays(date, 1) })} aria-label="შემდეგი დღე">
          <ChevronRight />
        </Button>
        {date !== today && (
          <Button variant="ghost" size="lg" onClick={() => go({ date: today })}>
            დღეს
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-80">
          <SearchPicker
            id="appointments-doctor"
            items={items}
            onSelect={(item) => go({ doctorId: item.id })}
            placeholder={selected ? `${selected.name} — შეცვლა` : "ექიმი: სახელი, გვარი ან სპეციალობა"}
            emptyText="ექიმი ვერ მოიძებნა"
            closeOnSelect
          />
        </div>
        {selected ? (
          <Badge variant="secondary" className="h-8 gap-1.5 px-3 text-sm">
            {selected.name}
            <span className="text-muted-foreground">· {selected.specialty}</span>
            <button
              type="button"
              onClick={() => go({ doctorId: null })}
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
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="იტვირთება..." />}
    </div>
  );
}
