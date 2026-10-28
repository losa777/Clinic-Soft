"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck, CircleCheck, DoorOpen, Star, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createAppointment } from "@/lib/appointment-actions";
import type { AppointmentRoutes } from "@/lib/appointment-routes";
import { BOOKING_HORIZON_DAYS, type BookingDoctor, type BookingPatient, type SpecialtyOption } from "@/lib/appointment-schema";
import { addDays, formatDate, isoWeekday, type Slot, WEEKDAYS, weekdayName } from "@/lib/appointment-slots";
import { cn } from "@/lib/utils";
import { FirstVisitHint, specialtyBalance, useFirstVisitBalance } from "./first-visit-hint";
import { PatientPicker } from "./patient-picker";
import { SlotGrid, useDoctorSlots } from "./slot-grid";

/** სწრაფი არჩევისთვის ნაჩვენები დღეები (დანარჩენი — კალენდრით). */
const QUICK_DAYS = 14;

type Booked = { message: string; date: string };

/**
 * ვიზიტის დაჯავშნა: პაციენტი → სპეციალობა → ექიმი → თარიღი → სლოტი → კომენტარი და დადასტურება.
 * როლზე არ არის მიბმული — მისამართები `routes`-ით მოდის (რეგისტრატორი, მომავალში ქოლ ცენტრი და ა.შ.).
 */
export function BookingWizard({
  specialties,
  doctors,
  today,
  routes,
  insuranceCompanies,
  initial,
}: {
  specialties: SpecialtyOption[];
  doctors: BookingDoctor[];
  /** დღევანდელი თარიღი თბილისში (სერვერიდან — hydration-ის შეუსაბამობა რომ არ მოხდეს) */
  today: string;
  routes: AppointmentRoutes;
  /** ახალი პაციენტის რეგისტრაციისას პოლისის დასამატებლად (უფლების გარეშე — undefined) */
  insuranceCompanies?: { id: number; name: string }[];
  /** წინასწარ შევსებული მნიშვნელობები (მაგ. ექიმის მიმართვა / განმეორებითი ვიზიტი) */
  initial?: { patient?: BookingPatient; doctorId?: number; date?: string; comment?: string };
}) {
  const initialDoctor = doctors.find((d) => d.id === initial?.doctorId);
  const [patient, setPatient] = useState<BookingPatient | null>(initial?.patient ?? null);
  const [specialtyId, setSpecialtyId] = useState<number | null>(initialDoctor?.specialtyId ?? null);
  const [doctorId, setDoctorId] = useState<number | null>(initialDoctor?.id ?? null);
  const [date, setDate] = useState(initial?.date && initial.date > today ? initial.date : today);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const specialtyDoctors = useMemo(() => doctors.filter((d) => d.specialtyId === specialtyId), [doctors, specialtyId]);
  const specialty = specialties.find((s) => s.id === specialtyId) ?? null;
  // სპეციალობა იძებნება დასახელებით და მისი ექიმების სახელ-გვარით
  const specialtyItems = useMemo<PickerItem[]>(
    () =>
      specialties.map((s) => {
        const names = doctors.filter((d) => d.specialtyId === s.id).map((d) => d.name);
        return { id: s.id, label: s.name, detail: `ექიმი: ${names.length}`, keywords: names.join(" ") };
      }),
    [specialties, doctors],
  );
  const doctor = doctors.find((d) => d.id === doctorId) ?? null;
  const slots = useDoctorSlots({ doctorId, date, patientId: patient?.id, reloadKey });
  // პირველადი პაციენტების დაბალანსება: სპეციალობის ექიმებს — „N პირველადი“, ახალ პაციენტზე — რეკომენდებული ექიმი
  const balance = specialtyBalance(useFirstVisitBalance(date, patient?.id ?? null, reloadKey), specialtyId);

  function resetSlot() {
    setSlot(null);
    setError(undefined);
  }

  function chooseSpecialty(id: number | null) {
    setSpecialtyId(id);
    setDoctorId(null);
    resetSlot();
  }

  function chooseDoctor(id: number) {
    setDoctorId(id);
    resetSlot();
    setBooked(null);
  }

  function chooseDate(next: string) {
    setDate(next);
    resetSlot();
  }

  function choosePatient(next: BookingPatient | null) {
    setPatient(next);
    resetSlot();
    setBooked(null);
  }

  function confirm() {
    if (!patient || !doctor || !slot) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const res = await createAppointment({ patientId: patient.id, doctorId: doctor.id, start: slot.start, comment });
        if (res.ok) {
          toast.success(res.message);
          setBooked({ message: res.message, date });
          setSlot(null);
          setComment("");
        } else {
          setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
          toast.error(res.error ?? "ჯავშანი ვერ შეიქმნა");
        }
      } catch {
        toast.error("ჯავშანი ვერ შეიქმნა. სცადეთ თავიდან");
      }
      // სლოტები თავიდან: ჩვენი ან სხვისი ახალი ჯავშანი დაკავებულად გამოჩნდება
      setReloadKey((k) => k + 1);
    });
  }

  if (!doctors.length) {
    return (
      <Alert>
        <AlertTitle>ექიმები არ არის დამატებული</AlertTitle>
        <AlertDescription>ჯავშნისთვის საჭიროა ექიმები სპეციალობითა და სამუშაო გრაფიკით (სატესტო მონაცემები: npm run db:seed).</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Step n={1} title="პაციენტი" done={!!patient}>
        <PatientPicker value={patient} onChange={choosePatient} insuranceCompanies={insuranceCompanies} />
      </Step>

      <Step n={2} title="სპეციალობა და ექიმი" done={!!doctor} disabled={!patient}>
        <div className="flex flex-col gap-4">
          <FormField id="booking-specialty" label="სპეციალობა" hint="მოძებნეთ სპეციალობით ან ექიმის სახელით/გვარით">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="sm:w-96">
                <SearchPicker
                  id="booking-specialty"
                  items={specialtyItems}
                  onSelect={(item) => chooseSpecialty(item.id)}
                  placeholder={specialty ? `${specialty.name} — შეცვლა` : "მაგ. კარდიოლოგი"}
                  emptyText="სპეციალობა ან ექიმი ვერ მოიძებნა"
                  closeOnSelect
                />
              </div>
              {specialty && (
                <Badge variant="secondary" className="h-8 gap-1.5 px-3 text-sm">
                  {specialty.name}
                  <button
                    type="button"
                    onClick={() => chooseSpecialty(null)}
                    className="-mr-1 rounded-sm text-muted-foreground hover:text-foreground"
                    aria-label="სპეციალობის მოხსნა"
                  >
                    <X className="size-3.5" />
                  </button>
                </Badge>
              )}
            </div>
          </FormField>

          {specialtyId !== null && balance.recommended && (
            <FirstVisitHint
              recommended={balance.recommended}
              date={date}
              today={today}
              selected={doctorId === balance.recommended.doctorId}
              onChoose={() => chooseDoctor(balance.recommended!.doctorId)}
            />
          )}

          {specialtyId !== null && (
            <div role="radiogroup" aria-label="ექიმი" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {specialtyDoctors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={d.id === doctorId}
                  onClick={() => chooseDoctor(d.id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
                    d.id === doctorId && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span className="flex w-full items-center gap-1.5 font-medium">
                    {d.name}
                    {balance.recommended?.doctorId === d.id && <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label="რეკომენდებული" />}
                  </span>
                  {balance.doctors.has(d.id) && (
                    <span className="text-xs">
                      {date === today ? "დღეს" : formatDate(date)}: <b>{balance.doctors.get(d.id)!.first}</b> პირველადი · {balance.doctors.get(d.id)!.all} ვიზიტი
                    </span>
                  )}
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer className="size-3.5" />
                      {d.duration} წთ
                    </span>
                    {d.room && (
                      <span className="flex items-center gap-1">
                        <DoorOpen className="size-3.5" />
                        კაბ. {d.room}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.weekdays.length ? d.weekdays.map((w) => WEEKDAYS[w - 1].slice(0, 3)).join(", ") : "გრაფიკი არ აქვს"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Step>

      <Step n={3} title="თარიღი და დრო" done={!!slot} disabled={!patient || !doctor}>
        {doctor && (
          <div className="flex flex-col gap-4">
            <DayPicker today={today} value={date} onChange={chooseDate} workdays={doctor.weekdays} />
            <SlotGrid state={slots} value={slot?.start ?? null} onSelect={(s) => { setSlot(s); setError(undefined); }} />
          </div>
        )}
      </Step>

      <Step n={4} title="დადასტურება" disabled={!slot}>
        {booked && !slot && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            <CircleCheck />
            <AlertTitle>{booked.message}</AlertTitle>
            <AlertDescription className="flex flex-wrap gap-2 pt-1">
              <Link href={`${routes.list}?date=${booked.date}`} className={buttonVariants({ variant: "outline" })}>
                დღის ჯავშნების ნახვა
              </Link>
              <Button variant="ghost" onClick={() => choosePatient(null)}>
                ახალი პაციენტის დაჯავშნა
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {patient && doctor && slot && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-4">
              <Summary label="პაციენტი" value={`${patient.firstName} ${patient.lastName}`} />
              <Summary label="ექიმი" value={`${doctor.name} (${doctor.specialty})`} />
              <Summary label="თარიღი" value={`${formatDate(date)}, ${weekdayName(date)}`} />
              <Summary label="დრო" value={`${slot.time} · ${doctor.duration} წთ${doctor.room ? ` · კაბ. ${doctor.room}` : ""}`} />
            </dl>
            <FormField id="booking-comment" label="კომენტარი">
              <Textarea
                id="booking-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="მაგ. პირველადი კონსულტაცია, ანალიზების პასუხებით"
              />
            </FormField>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end">
              <Button size="lg" onClick={confirm} disabled={pending}>
                <CalendarCheck />
                {pending ? "ინახება..." : "ჯავშნის დადასტურება"}
              </Button>
            </div>
          </div>
        )}
      </Step>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  disabled,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(disabled && "opacity-60")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
              done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {n}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      {!disabled && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** უახლოესი დღეები ღილაკებად (ექიმის არასამუშაო დღე — გათიშული) და კალენდარი სხვა თარიღისთვის. */
export function DayPicker({
  today,
  value,
  onChange,
  workdays,
}: {
  today: string;
  value: string;
  onChange: (date: string) => void;
  workdays: number[];
}) {
  const days = Array.from({ length: QUICK_DAYS }, (_, i) => addDays(today, i));
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const works = workdays.includes(isoWeekday(d));
          return (
            <button
              key={d}
              type="button"
              disabled={!works}
              onClick={() => onChange(d)}
              aria-pressed={d === value}
              title={works ? undefined : "ექიმი ამ დღეს არ მუშაობს"}
              className={cn(
                "flex w-16 shrink-0 flex-col items-center rounded-lg border py-1.5 text-xs transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border",
                d === value && "border-primary bg-primary text-primary-foreground",
              )}
            >
              <span>{d === today ? "დღეს" : weekdayName(d).slice(0, 3)}</span>
              <span className="text-base font-semibold tabular-nums">{d.slice(8)}</span>
              <span className="tabular-nums opacity-70">{d.slice(5, 7)}</span>
            </button>
          );
        })}
      </div>
      <FormField id="booking-date" label="სხვა თარიღი">
        <Input
          id="booking-date"
          type="date"
          value={value}
          min={today}
          max={addDays(today, BOOKING_HORIZON_DAYS)}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="h-10 w-full sm:w-52"
        />
      </FormField>
    </div>
  );
}
