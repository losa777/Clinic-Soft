"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarCheck, CircleCheck, DoorOpen, PhoneCall, RotateCcw, Star, Timer, UserRound } from "lucide-react";
import { toast } from "sonner";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createAppointment } from "@/lib/appointment-actions";
import type { BookingDoctor, BookingPatient, SpecialtyOption } from "@/lib/appointment-schema";
import { addDays, formatDate, isoWeekday, type Slot, WEEKDAYS, weekdayName } from "@/lib/appointment-slots";
import { cn } from "@/lib/utils";
import { DayPicker } from "./booking-wizard";
import { allBalance, FirstVisitHint, useFirstVisitBalance } from "./first-visit-hint";
import { PatientPicker } from "./patient-picker";
import { PatientUpcoming } from "./patient-upcoming";
import { SlotGrid, useDoctorSlots } from "./slot-grid";

/** ექიმის უახლოესი სამუშაო დღე (დღეიდან 14 დღეში); არ აქვს — დღეს. */
function nearestWorkday(today: string, weekdays: number[]): string {
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    if (weekdays.includes(isoWeekday(d))) return d;
  }
  return today;
}

type Booked = { patient: string; doctor: string; specialty: string; date: string; time: string; room: string | null };

/**
 * ქოლ ცენტრის დაჯავშნა — ერთ გვერდზე, ზარის თანმიმდევრობით: ზემოთ პაციენტი (ძებნა ტელეფონით/სახელით/პირადი ნომრით,
 * ახალის რეგისტრაცია იქვე), მარცხნივ ექიმები (მაშინვე ჩანს — ძებნა, სპეციალობის ფილტრი), მარჯვნივ დღე, დრო და
 * დადასტურება. ექიმი და დრო შეიძლება პაციენტამდეც შეირჩეს. დაჯავშნის შემდეგ — პაციენტისთვის წასაკითხი ტექსტი და „ახალი ზარი“.
 * არჩეული პაციენტის მომავალი ჯავშნები — გადატანით და გაუქმებით (appointments.change).
 * ლოგიკა (სლოტები, კონფლიქტები, შენახვა) — იგივე, რაც რეგისტრატურის დაჯავშნაში (appointments.book).
 */
export function CallCenterBooking({ specialties, doctors, today }: { specialties: SpecialtyOption[]; doctors: BookingDoctor[]; today: string }) {
  // call — ახალი ზარისას ყველაფერი თავიდან (პაციენტის ძებნის ველიც)
  const [call, setCall] = useState(0);
  const [patient, setPatient] = useState<BookingPatient | null>(null);
  const [specialtyId, setSpecialtyId] = useState<number | null>(null);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [comment, setComment] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const doctor = doctors.find((d) => d.id === doctorId) ?? null;
  const shownDoctors = useMemo(() => (specialtyId ? doctors.filter((d) => d.specialtyId === specialtyId) : doctors), [doctors, specialtyId]);
  const doctorItems = useMemo<PickerItem[]>(
    () => doctors.map((d) => ({ id: d.id, label: d.name, detail: d.specialty, keywords: d.specialty })),
    [doctors],
  );
  const slots = useDoctorSlots({ doctorId, date, patientId: patient?.id, reloadKey });
  // პირველადი პაციენტების დაბალანსება: ბარათებზე „N პირველადი“, ახალ პაციენტზე — რეკომენდებული ექიმი სპეციალობით
  const balance = allBalance(useFirstVisitBalance(date, patient?.id ?? null, reloadKey));
  // მინიშნება — არჩეული ექიმის სპეციალობისთვის, ან (ექიმამდე) არჩეული სპეციალობის ჩიპისთვის
  const hint = balance.recommended.get(doctor?.specialtyId ?? specialtyId ?? -1) ?? null;

  function chooseDoctor(id: number) {
    const d = doctors.find((x) => x.id === id);
    setDoctorId(id);
    setSlot(null);
    setError(undefined);
    setBooked(null);
    // ექიმი დღეს არ მუშაობს — უახლოეს სამუშაო დღეზე
    if (d && !d.weekdays.includes(isoWeekday(date))) setDate(nearestWorkday(today, d.weekdays));
  }

  function choosePatient(next: BookingPatient | null) {
    setPatient(next);
    setSlot(null);
    setError(undefined);
    setBooked(null);
  }

  function newCall() {
    setCall((c) => c + 1);
    setPatient(null);
    setSpecialtyId(null);
    setDoctorId(null);
    setDate(today);
    setSlot(null);
    setComment("");
    setBooked(null);
    setError(undefined);
  }

  /** იმავე პაციენტს — კიდევ ერთი ჯავშანი (სხვა ექიმთან / სხვა დროს). */
  function anotherForPatient() {
    setDoctorId(null);
    setSlot(null);
    setComment("");
    setBooked(null);
    setError(undefined);
  }

  function confirm() {
    if (!patient || !doctor || !slot) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const res = await createAppointment({ patientId: patient.id, doctorId: doctor.id, start: slot.start, comment });
        if (res.ok) {
          toast.success(res.message);
          setBooked({
            patient: `${patient.firstName} ${patient.lastName}`,
            doctor: doctor.name,
            specialty: doctor.specialty,
            date,
            time: slot.time,
            room: doctor.room,
          });
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
        <AlertDescription>ჯავშნისთვის საჭიროა ექიმები სპეციალობითა და სამუშაო გრაფიკით.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <PhoneCall className="size-5 text-primary" />
          ვიზიტის დაჯავშნა
        </h1>
        <Button variant="outline" size="lg" onClick={newCall}>
          <RotateCcw />
          ახალი ზარი
        </Button>
      </div>

      {/* 1. პაციენტი */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StepNumber n={1} done={!!patient} />
            პაციენტი
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PatientPicker key={call} value={patient} onChange={choosePatient} />
          {/* „როდის მაქვს ჩაწერა?“ — გადატანა/გაუქმება იქვე; გადატანისას სლოტებიც ახლდება */}
          {patient && <PatientUpcoming patientId={patient.id} today={today} reloadKey={reloadKey} onChanged={() => setReloadKey((k) => k + 1)} />}
        </CardContent>
      </Card>

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 2. ექიმი */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StepNumber n={2} done={!!doctor} />
              ექიმი
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SearchPicker
              key={call}
              id="callcenter-doctor"
              items={doctorItems}
              onSelect={(item) => chooseDoctor(item.id)}
              placeholder="ექიმის სახელი, გვარი ან სპეციალობა"
              emptyText="ექიმი ვერ მოიძებნა"
              closeOnSelect
            />
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="სპეციალობა">
              <Chip active={specialtyId === null} onClick={() => setSpecialtyId(null)}>
                ყველა
              </Chip>
              {specialties.map((s) => (
                <Chip key={s.id} active={specialtyId === s.id} onClick={() => setSpecialtyId(s.id)}>
                  {s.name}
                </Chip>
              ))}
            </div>
            {hint && <FirstVisitHint recommended={hint} date={date} today={today} selected={doctorId === hint.doctorId} onChoose={() => chooseDoctor(hint.doctorId)} />}
            <div role="radiogroup" aria-label="ექიმი" className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {shownDoctors.map((d) => (
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
                    {balance.recommended.get(d.specialtyId)?.doctorId === d.id && (
                      <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label="რეკომენდებული პირველადი პაციენტისთვის" />
                    )}
                  </span>
                  <span className="text-xs text-primary">{d.specialty}</span>
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
          </CardContent>
        </Card>

        {/* 3. დრო და დადასტურება — გადახვევისას ეკრანზე რჩება */}
        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StepNumber n={3} done={!!slot} />
              დღე და დრო
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {booked ? (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                <CircleCheck />
                <AlertTitle>დაჯავშნილია</AlertTitle>
                <AlertDescription className="flex flex-col gap-3 text-emerald-800 dark:text-emerald-200">
                  {/* ტექსტი პაციენტისთვის ტელეფონში წასაკითხად */}
                  <p className="text-base">
                    {booked.patient}, თქვენ ჩაწერილი ხართ <b>{formatDate(booked.date)}</b>, {weekdayName(booked.date)}, <b>{booked.time}</b>-ზე —{" "}
                    {booked.doctor} ({booked.specialty}){booked.room ? `, კაბინეტი ${booked.room}` : ""}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={newCall}>
                      <RotateCcw />
                      ახალი ზარი
                    </Button>
                    <Button variant="outline" onClick={anotherForPatient}>
                      იმავე პაციენტის კიდევ ერთი ჯავშანი
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : !doctor ? (
              <p className="py-10 text-center text-sm text-muted-foreground">აირჩიეთ ექიმი — აქ გამოჩნდება მისი თავისუფალი დრო</p>
            ) : (
              <>
                <p className="text-sm">
                  <b>{doctor.name}</b> <span className="text-muted-foreground">· {doctor.specialty}</span>
                </p>
                <DayPicker today={today} value={date} onChange={(d) => (setDate(d), setSlot(null), setError(undefined))} workdays={doctor.weekdays} />
                <SlotGrid state={slots} value={slot?.start ?? null} onSelect={(s) => (setSlot(s), setError(undefined))} />
              </>
            )}

            {!booked && doctor && slot && (
              <div className="flex flex-col gap-3 border-t pt-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted/40 p-3 text-sm">
                  <Summary label="პაციენტი" value={patient ? `${patient.firstName} ${patient.lastName}` : "— აირჩიეთ ზემოთ"} missing={!patient} />
                  <Summary label="დრო" value={`${formatDate(date)}, ${weekdayName(date)}, ${slot.time}`} />
                </dl>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={1000} placeholder="კომენტარი (არასავალდებულო): მაგ. პირველადი კონსულტაცია" aria-label="კომენტარი" />
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button size="lg" className="h-12 text-base" onClick={confirm} disabled={pending || !patient}>
                  <CalendarCheck />
                  {pending ? "ინახება..." : patient ? "დაჯავშნა" : "ჯერ აირჩიეთ პაციენტი"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
        done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Summary({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label === "პაციენტი" && <UserRound className="size-3" />}
        {label}
      </dt>
      <dd className={cn("font-medium", missing && "text-destructive")}>{value}</dd>
    </div>
  );
}
