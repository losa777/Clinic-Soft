"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getDoctorSlots } from "@/lib/appointment-actions";
import type { Slot, SlotState } from "@/lib/appointment-slots";
import { cn } from "@/lib/utils";

type SlotsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; slots: Slot[]; dayOff: boolean };

/**
 * ექიმის დღის სლოტები სერვერიდან. იტვირთება ექიმის/თარიღის/პაციენტის შეცვლისას და `reloadKey`-ის ზრდისას
 * (მაგ. ჯავშნის შემდეგ). ძველი პასუხი ახალს არ გადაეწერება.
 */
export function useDoctorSlots({
  doctorId,
  date,
  patientId,
  excludeAppointmentId,
  reloadKey = 0,
}: {
  doctorId: number | null;
  date: string;
  patientId?: number | null;
  excludeAppointmentId?: number;
  reloadKey?: number;
}): SlotsState {
  // პასუხი ინახება მოთხოვნის გასაღებთან ერთად: გასაღები შეიცვალა — ჯერ „იტვირთება“, სანამ ახალი პასუხი მოვა
  const key = doctorId && date ? [doctorId, date, patientId ?? "", excludeAppointmentId ?? "", reloadKey].join("|") : null;
  const [loaded, setLoaded] = useState<{ key: string; state: SlotsState } | null>(null);

  useEffect(() => {
    if (!key || !doctorId) return;
    let current = true;
    getDoctorSlots({ doctorId, date, patientId: patientId ?? null, excludeAppointmentId: excludeAppointmentId ?? null })
      .then((res) => {
        if (!current) return;
        setLoaded({
          key,
          state: res.ok ? { status: "ready", slots: res.slots, dayOff: res.dayOff } : { status: "error", error: res.error },
        });
      })
      .catch(() => current && setLoaded({ key, state: { status: "error", error: "სლოტები ვერ ჩაიტვირთა. სცადეთ თავიდან" } }));
    return () => {
      current = false;
    };
  }, [key, doctorId, date, patientId, excludeAppointmentId]);

  if (!key) return { status: "idle" };
  return loaded?.key === key ? loaded.state : { status: "loading" };
}

const STATE_TITLE: Record<Exclude<SlotState, "free">, string> = {
  busy: "დაკავებულია",
  patient: "პაციენტს ამ დროს სხვა ჯავშანი აქვს",
  past: "დრო გასულია",
};

/** სლოტები ღილაკების ბადედ: თავისუფალი — ასარჩევი, დაკავებული/გასული — გათიშული. */
export function SlotGrid({
  state,
  value,
  onSelect,
}: {
  state: SlotsState;
  value: string | null;
  onSelect: (slot: Slot) => void;
}) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        სლოტები იტვირთება...
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }

  if (state.dayOff || state.slots.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
        <CalendarOff className="size-4" />
        ექიმი ამ დღეს არ მუშაობს — აირჩიეთ სხვა თარიღი
      </p>
    );
  }

  const free = state.slots.filter((s) => s.state === "free").length;
  const patientBusy = state.slots.some((s) => s.state === "patient");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        თავისუფალი: <b className="text-foreground">{free}</b> / {state.slots.length}
        {free === 0 && " — ამ დღეს თავისუფალი დრო აღარ არის"}
      </p>
      <div role="radiogroup" aria-label="ვიზიტის დრო" className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {state.slots.map((slot) => {
          const selected = slot.start === value;
          const disabled = slot.state !== "free";
          return (
            <button
              key={slot.start}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              title={disabled ? STATE_TITLE[slot.state as Exclude<SlotState, "free">] : undefined}
              onClick={() => onSelect(slot)}
              className={cn(
                "h-10 rounded-lg border text-sm font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:border-primary hover:text-primary",
                slot.state === "busy" && "cursor-not-allowed bg-muted text-muted-foreground line-through hover:border-border hover:text-muted-foreground",
                slot.state === "past" && "cursor-not-allowed border-dashed text-muted-foreground/60 hover:border-border hover:text-muted-foreground/60",
                slot.state === "patient" &&
                  "cursor-not-allowed border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-300 hover:text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
              )}
            >
              {slot.time}
            </button>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend className="bg-background">თავისუფალი</Legend>
        <Legend className="bg-muted">დაკავებული</Legend>
        <Legend className="border-dashed">გასული</Legend>
        {patientBusy && (
          <Legend className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">პაციენტს სხვა ჯავშანი აქვს</Legend>
        )}
      </ul>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded border", className)} />
      {children}
    </li>
  );
}
