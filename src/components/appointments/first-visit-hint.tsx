"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstVisitBalance } from "@/lib/appointment-actions";
import { formatDate } from "@/lib/appointment-slots";
import { type FirstVisitDoctor, type FirstVisitStats, recommendDoctor } from "@/lib/first-visit-balance";

type Balance = { stats: FirstVisitStats; patientIsNew: boolean | null };

/**
 * პირველადი პაციენტების დაბალანსება დაჯავშნისას: დღის სტატისტიკა (key — თარიღი, პაციენტი, ახალი ჯავშანი).
 * ცარიელი/შეცდომა — null (მინიშნება უბრალოდ არ ჩანს, დაჯავშნას არ აბრკოლებს).
 */
export function useFirstVisitBalance(date: string, patientId: number | null, reloadKey: number): Balance | null {
  const [state, setState] = useState<{ key: string; value: Balance | null } | null>(null);
  const key = `${date}:${patientId ?? 0}:${reloadKey}`;

  useEffect(() => {
    let current = true;
    firstVisitBalance(date, patientId)
      .then((value) => current && setState({ key, value }))
      .catch(() => current && setState({ key, value: null }));
    return () => {
      current = false;
    };
  }, [date, patientId, key]);

  return state?.key === key ? state.value : null;
}

/** სპეციალობის ექიმები სტატისტიკიდან (რეკომენდაციისა და ბარათებზე „N პირველადი“-სთვის). */
export function specialtyBalance(balance: Balance | null, specialtyId: number | null): { doctors: Map<number, FirstVisitDoctor>; recommended: FirstVisitDoctor | null } {
  const specialty = balance?.stats.specialties.find((s) => s.id === specialtyId);
  return {
    doctors: new Map((specialty?.doctors ?? []).map((d) => [d.doctorId, d])),
    // მხოლოდ ახალ (პირველად) პაციენტზე
    recommended: specialty && balance?.patientIsNew ? recommendDoctor(specialty.doctors) : null,
  };
}

/**
 * ყველა სპეციალობა ერთად (ქოლ ცენტრი — ექიმები ერთ სიაშია): ექიმის სტატისტიკა და რეკომენდებული ექიმი სპეციალობის მიხედვით
 * (მხოლოდ ახალ პაციენტზე).
 */
export function allBalance(balance: Balance | null): { doctors: Map<number, FirstVisitDoctor>; recommended: Map<number, FirstVisitDoctor> } {
  const doctors = new Map<number, FirstVisitDoctor>();
  const recommended = new Map<number, FirstVisitDoctor>();
  for (const s of balance?.stats.specialties ?? []) {
    for (const d of s.doctors) doctors.set(d.doctorId, d);
    const r = balance?.patientIsNew ? recommendDoctor(s.doctors) : null;
    if (r) recommended.set(s.id, r);
  }
  return { doctors, recommended };
}

/** „ახალი პაციენტი — რეკომენდებულია …“ ერთი დაჭერით არჩევით. */
export function FirstVisitHint({
  recommended,
  date,
  today,
  selected,
  onChoose,
}: {
  recommended: FirstVisitDoctor;
  date: string;
  today: string;
  selected: boolean;
  onChoose: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <Star className="size-4 shrink-0 fill-current" />
      <span className="min-w-0 flex-1">
        პირველადი პაციენტია — {date === today ? "დღეს" : formatDate(date)} ნაკლები პირველადი ჰყავს <b>{recommended.name}</b>-ს ({recommended.first}
        {" "}პირველადი, {recommended.all} ვიზიტი). უმჯობესია, მასთან ჩაეწეროს.
      </span>
      {!selected && (
        <Button size="sm" variant="outline" onClick={onChoose}>
          არჩევა
        </Button>
      )}
    </div>
  );
}
