"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, SearchX, UserPlus, UserRound, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchAppointmentPatients } from "@/lib/appointment-actions";
import type { BookingPatient } from "@/lib/appointment-schema";
import type { PatientSearchResult, PatientSearchRow } from "@/lib/patient-records";
import { useRecentPatients } from "@/components/patients/recent-patients";
import { DebtBadge } from "@/modules/finance/components/invoice-status-badge";
import { prefillFromQuery, QuickPatientForm } from "./quick-patient-form";

const DEBOUNCE_MS = 350;
const SEARCH_LIMIT = 20;

/** ძებნა იწყება 2 ასოდან ან 4 ციფრიდან. */
function isReady(q: string) {
  return /\d/.test(q) && /^[\d\s()+-]+$/.test(q) ? q.replace(/\D/g, "").length >= 4 : q.replace(/\s/g, "").length >= 2;
}

/**
 * პაციენტის არჩევა: ძებნა პირადი ნომრით, სახელით/გვარით ან ტელეფონით (debounce-ით, მაქს. 20 შედეგი);
 * ვერ მოიძებნა — ახალი პაციენტის რეგისტრაცია იქვე.
 */
export function PatientPicker({
  value,
  onChange,
  insuranceCompanies,
}: {
  value: BookingPatient | null;
  onChange: (patient: BookingPatient | null) => void;
  /** ახალი პაციენტის რეგისტრაციისას პოლისის დასამატებლად (უფლების გარეშე — undefined) */
  insuranceCompanies?: { id: number; name: string }[];
}) {
  const [query, setQuery] = useState("");
  // პასუხი ინახება ძებნის ტექსტთან ერთად; ახალი ძებნისას წინა შედეგი ჩანს, სანამ ახალი მოვა
  const [found, setFound] = useState<{ q: string; result: PatientSearchResult } | null>(null);
  const [registering, setRegistering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().replace(/\s+/g, " ");
  // ცარიელ ველზე დაჭერისას — ბოლო 50 პაციენტი (გვერდის გახსნისას ავტომატური ფოკუსი სიას არ ხსნის)
  const recent = useRecentPatients({ inputRef, autoFocus: true, suppressed: query.trim() !== "", onPick: onChange });
  const ready = isReady(q);

  useEffect(() => {
    if (!ready) return;
    let current = true;
    const timer = setTimeout(() => {
      searchAppointmentPatients(q)
        .then((result) => current && setFound({ q, result }))
        .catch(() => current && setFound({ q, result: { status: "invalid", error: "ძებნა ვერ შესრულდა. სცადეთ თავიდან" } }));
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q, ready]);

  const result: PatientSearchResult = ready && found ? found.result : { status: "empty" };
  const loading = ready && found?.q !== q;

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/30 p-4">
        <UserRound className="size-8 shrink-0 rounded-full bg-primary/10 p-1.5 text-primary" />
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <Field label="პაციენტი" value={`${value.firstName} ${value.lastName}`} strong />
          <Field label="პირადი ნომერი" value={value.personalId} mono />
          <Field label="დაბადების თარიღი" value={value.birthDate} />
          <Field label="ტელეფონი" value={value.phone ?? "—"} />
        </dl>
        <DebtBadge debt={value.debt} />
        <Button variant="outline" onClick={() => onChange(null)}>
          <X />
          შეცვლა
        </Button>
      </div>
    );
  }

  if (registering) {
    return (
      <QuickPatientForm
        initialValues={prefillFromQuery(query)}
        insuranceCompanies={insuranceCompanies}
        onCancel={() => setRegistering(false)}
        onCreated={(patient) => {
          setRegistering(false);
          setQuery("");
          onChange(patient);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          ref={inputRef}
          onChange={(e) => setQuery(e.target.value)}
          {...recent.handlers}
          onKeyDown={(e) => {
            if (recent.onKeyDown(e)) return;
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="პირადი ნომერი, გვარი და სახელი ან ტელეფონი"
          aria-label="პაციენტის ძებნა"
          autoComplete="off"
          autoFocus
          className="h-11 pr-10 pl-9 text-base"
        />
        {loading && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="ძებნა..." />
        )}
        {recent.dropdown}
      </div>

      {result.status === "invalid" && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result.status === "ok" && result.rows.length === 0 && !loading && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <SearchX />
          <AlertDescription className="flex flex-col items-start gap-3 text-amber-800 dark:text-amber-200">
            <span>„{query.trim()}“ — პაციენტი ვერ მოიძებნა.</span>
            <Button onClick={() => setRegistering(true)}>
              <UserPlus />
              ახალი პაციენტის რეგისტრაცია
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {result.status === "ok" && result.rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {result.hasMore ? `ნაჩვენებია პირველი ${SEARCH_LIMIT} — დააზუსტეთ ძებნა` : `ნაპოვნია: ${result.rows.length}`}
          </p>
          <ul className="divide-y overflow-hidden rounded-xl border">
            {result.rows.map((p) => (
              <PatientRow key={p.id} patient={p} onSelect={onChange} />
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            სასურველი პაციენტი სიაში არ არის?{" "}
            <button type="button" onClick={() => setRegistering(true)} className="font-medium text-primary hover:underline">
              ახალი პაციენტის რეგისტრაცია
            </button>
          </p>
        </div>
      )}

      {result.status === "empty" && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>ძებნა იწყება 2 ასოდან ან 4 ციფრიდან</span>
          <Button variant="ghost" onClick={() => setRegistering(true)}>
            <UserPlus />
            ახალი პაციენტი
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`truncate ${strong ? "font-semibold" : ""} ${mono ? "font-mono tracking-wider" : ""}`}>{value}</dd>
    </div>
  );
}

function PatientRow({ patient: p, onSelect }: { patient: PatientSearchRow; onSelect: (patient: BookingPatient) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(p)}
        className="grid w-full grid-cols-2 gap-x-4 gap-y-0.5 px-4 py-2.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted sm:grid-cols-4"
      >
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {p.lastName} {p.firstName}
          <DebtBadge debt={p.debt} />
        </span>
        <span className="font-mono tracking-wider text-muted-foreground">{p.personalId}</span>
        <span className="text-muted-foreground tabular-nums">{p.birthDate}</span>
        <span className="text-muted-foreground tabular-nums">{p.phone ?? "—"}</span>
      </button>
    </li>
  );
}
