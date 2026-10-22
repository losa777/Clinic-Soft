"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopyCheck, Plus, Save, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { WEEKDAYS } from "@/lib/appointment-slots";
import { type DoctorInput, doctorSchema, MAX_INTERVALS_PER_DAY, type ScheduleInterval } from "@/lib/doctor-schema";
import { cn } from "@/lib/utils";
import { fieldErrorsOf } from "@/lib/zod-errors";
import { saveDoctor } from "../actions";

type Hours = { key: number; start: string; end: string };
/** კვირის დღე (1–7) → ინტერვალები; ცარიელი სია — არ მუშაობს. */
type Week = Record<number, Hours[]>;

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const DEFAULT_HOURS = { start: "09:00", end: "18:00" };

let nextKey = 0;
const withKey = (h: { start: string; end: string }): Hours => ({ key: ++nextKey, ...h });

function toWeek(schedule: ScheduleInterval[]): Week {
  const week: Week = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const i of schedule) week[i.weekday].push(withKey(i));
  return week;
}

type Initial = {
  specialtyId: number | null;
  consultationServiceId: number | null;
  visitDuration: string;
  room: string;
  isActive: boolean;
  schedule: ScheduleInterval[];
};

export function DoctorForm({
  userId,
  roleIsDoctor,
  userActive,
  specialties,
  services,
  initial,
}: {
  userId: number;
  roleIsDoctor: boolean;
  userActive: boolean;
  specialties: { id: number; name: string }[];
  /** კონსულტაციის სერვისის ასარჩევად (აქტიური + უკვე მინიჭებული) */
  services: PickerItem[];
  initial: Initial;
}) {
  const router = useRouter();
  const [specialtyId, setSpecialtyId] = useState(initial.specialtyId);
  const [consultationServiceId, setConsultationServiceId] = useState(initial.consultationServiceId);
  const consultation = services.find((s) => s.id === consultationServiceId) ?? null;
  const [visitDuration, setVisitDuration] = useState(initial.visitDuration);
  const [room, setRoom] = useState(initial.room);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [week, setWeek] = useState<Week>(() => toWeek(initial.schedule));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [outside, setOutside] = useState(0);
  const [pending, startTransition] = useTransition();

  function updateDay(day: number, update: (hours: Hours[]) => Hours[]) {
    setWeek((w) => ({ ...w, [day]: update(w[day]) }));
    setErrors((e) => ({ ...e, schedule: "" }));
  }

  /** დღის ჩართვისას საათები წინა სამუშაო დღიდან კოპირდება (ან 09:00–18:00). */
  function toggleDay(day: number, on: boolean) {
    const previous = [...DAYS].reverse().find((d) => d < day && week[d].length);
    updateDay(day, () => (on ? (previous ? week[previous] : [DEFAULT_HOURS]).map(withKey) : []));
  }

  /** ამ დღის საათები ყველა სხვა სამუშაო დღეზე. */
  function copyToWorkdays(day: number) {
    setWeek((w) => Object.fromEntries(DAYS.map((d) => [d, d !== day && w[d].length ? w[day].map(withKey) : w[d]])));
    toast.info(`${WEEKDAYS[day - 1]}ს საათები გადავიდა ყველა სამუშაო დღეზე`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: DoctorInput = {
      userId,
      specialtyId: specialtyId ?? 0,
      visitDuration: visitDuration.trim() === "" ? Number.NaN : Number(visitDuration),
      room,
      isActive,
      consultationServiceId,
      schedule: DAYS.flatMap((d) => week[d].map(({ start, end }) => ({ weekday: d, start, end }))),
    };
    const parsed = doctorSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      setFormError(undefined);
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveDoctor(input);
        if (res.ok) {
          toast.success(res.message);
          setErrors({});
          setFormError(undefined);
          setOutside(res.outsideSchedule);
          router.refresh();
        } else {
          setErrors(res.fieldErrors ?? {});
          setFormError(res.fieldErrors ? undefined : res.error);
        }
      } catch {
        toast.error("შენახვა ვერ მოხერხდა. სცადეთ თავიდან");
      }
    });
  }

  const items = specialties.map((s) => ({ value: String(s.id), label: s.name }));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!roleIsDoctor && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>მომხმარებელს აღარ აქვს „ექიმის“ როლი</AlertTitle>
          <AlertDescription>ჯავშნებში ის არ ჩანს. როლი შეცვალეთ „მომხმარებლებში“.</AlertDescription>
        </Alert>
      )}
      {!userActive && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>მომხმარებელი გათიშულია, ამიტომ ჯავშნებში არ ჩანს.</AlertDescription>
        </Alert>
      )}
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {outside > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <TriangleAlert />
          <AlertTitle>{outside} მომავალი ჯავშანი ახალ განრიგს აღარ ემთხვევა</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            არსებული ჯავშნები ავტომატურად არ იცვლება — რეგისტრატურამ ისინი უნდა გადაიტანოს ან გააუქმოს („ჯავშნები“, ექიმის ფილტრით).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>პროფილი</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField id="doctor-specialty" label="სპეციალობა *" error={errors.specialtyId}>
            <Select
              items={items}
              value={specialtyId === null ? null : String(specialtyId)}
              onValueChange={(v) => {
                setSpecialtyId(v ? Number(v) : null);
                setErrors((e) => ({ ...e, specialtyId: "" }));
              }}
            >
              <SelectTrigger id="doctor-specialty" className="h-10 w-full" aria-invalid={errors.specialtyId ? true : undefined}>
                <SelectValue placeholder="აირჩიეთ" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!specialties.length && (
              <Link href="/admin/specialties" className="text-xs text-primary hover:underline">
                ჯერ დაამატეთ სპეციალობა
              </Link>
            )}
          </FormField>
          <FormField id="doctor-duration" label="ვიზიტის ხანგრძლივობა (წთ) *" error={errors.visitDuration} hint="5–240 წუთი">
            <Input
              id="doctor-duration"
              type="number"
              min={5}
              max={240}
              step={5}
              value={visitDuration}
              onChange={(e) => setVisitDuration(e.target.value)}
              aria-invalid={errors.visitDuration ? true : undefined}
              className="h-10 tabular-nums"
            />
          </FormField>
          <FormField id="doctor-room" label="კაბინეტი" error={errors.room}>
            <Input
              id="doctor-room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              maxLength={20}
              placeholder="მაგ. 101"
              className="h-10"
            />
          </FormField>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">ჯავშნისთვის ხელმისაწვდომია</span>
            <label className="flex h-10 items-center gap-2 text-sm">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              {isActive ? "კი" : "არა — ექიმი ჯავშნებში არ ჩანს"}
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <FormField
              id="doctor-consultation"
              label="კონსულტაციის სერვისი"
              error={errors.consultationServiceId}
              hint="ჯავშნიდან ინვოისის შექმნისას ავტომატურად ჩაჯდება"
            >
              {consultation ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm">
                  <span className="flex-1 truncate">{consultation.label}</span>
                  <span className="text-muted-foreground tabular-nums">{consultation.detail}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConsultationServiceId(null)}>
                    მოხსნა
                  </Button>
                </div>
              ) : (
                <SearchPicker
                  id="doctor-consultation"
                  items={services}
                  onSelect={(item) => {
                    setConsultationServiceId(item.id);
                    setErrors((e) => ({ ...e, consultationServiceId: "" }));
                  }}
                  placeholder="მოძებნეთ სერვისი, მაგ. კარდიოლოგის კონსულტაცია"
                  emptyText="სერვისი ვერ მოიძებნა"
                  closeOnSelect
                />
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>სამუშაო განრიგი</CardTitle>
          <p className="text-sm text-muted-foreground">
            თბილისის დროით. დღეში შეიძლება რამდენიმე ინტერვალი (მაგ. შესვენებით). სლოტები ამ საათებიდან და ვიზიტის ხანგრძლივობიდან
            ითვლება.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {errors.schedule && (
            <Alert variant="destructive">
              <AlertDescription>{errors.schedule}</AlertDescription>
            </Alert>
          )}
          <ul className="divide-y rounded-xl border">
            {DAYS.map((day) => {
              const hours = week[day];
              const works = hours.length > 0;
              return (
                <li key={day} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                  <label className="flex w-40 shrink-0 items-center gap-2 pt-2 text-sm font-medium">
                    <Switch checked={works} onCheckedChange={(on) => toggleDay(day, on)} />
                    <span className={cn(!works && "text-muted-foreground")}>{WEEKDAYS[day - 1]}</span>
                  </label>
                  {works ? (
                    <div className="flex flex-1 flex-col gap-2">
                      {hours.map((h, i) => (
                        <div key={h.key} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={h.start}
                            onChange={(e) => updateDay(day, (list) => list.map((x, n) => (n === i ? { ...x, start: e.target.value } : x)))}
                            aria-label={`${WEEKDAYS[day - 1]}: დაწყება`}
                            className="h-9 w-32 tabular-nums"
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={h.end}
                            onChange={(e) => updateDay(day, (list) => list.map((x, n) => (n === i ? { ...x, end: e.target.value } : x)))}
                            aria-label={`${WEEKDAYS[day - 1]}: დასრულება`}
                            className="h-9 w-32 tabular-nums"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => updateDay(day, (list) => list.filter((_, n) => n !== i))}
                            aria-label="ინტერვალის წაშლა"
                            title="ინტერვალის წაშლა"
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={hours.length >= MAX_INTERVALS_PER_DAY}
                          onClick={() => {
                            const last = hours.at(-1)!;
                            // შემდეგი ინტერვალი წინას ბოლოდან იწყება (მაგ. შესვენების შემდეგ)
                            updateDay(day, (list) => [...list, withKey({ start: last.end, end: last.end < "18:00" ? "18:00" : "23:59" })]);
                          }}
                        >
                          <Plus />
                          ინტერვალი
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => copyToWorkdays(day)}>
                          <CopyCheck />
                          ყველა სამუშაო დღეზე
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="pt-2 text-sm text-muted-foreground">არ მუშაობს</p>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          <Save />
          {pending ? "ინახება..." : "შენახვა"}
        </Button>
      </div>
    </form>
  );
}
