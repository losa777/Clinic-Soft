"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { cancelAppointment, changeAppointmentStatus, rescheduleAppointment } from "@/lib/appointment-actions";
import { type AppointmentRow, appointmentStatusLabel, BOOKING_HORIZON_DAYS, STATUS_TRANSITIONS } from "@/lib/appointment-schema";
import { addDays, formatDate, type Slot } from "@/lib/appointment-slots";
import { SlotGrid, useDoctorSlots } from "./slot-grid";

type ChangeableStatus = "booked" | "arrived" | "no_show";

/** ჯავშნის მოქმედებები ცხრილში: სტატუსის შეცვლა, გადატანა, გაუქმება. CancelForm / RescheduleForm — ქოლ ცენტრის გვერდიც იყენებს. */
export function AppointmentRowActions({ row, today }: { row: AppointmentRow; today: string }) {
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const { run, pending } = useSubmit(() => setDialog(null));
  const close = () => setDialog(null);

  const transitions = STATUS_TRANSITIONS[row.status] as ChangeableStatus[];
  const canReschedule = row.status === "booked";
  const canCancel = row.status !== "cancelled" && row.status !== "completed" && row.status !== "in_progress";
  if (!transitions.length && !canCancel) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="მოქმედებები" disabled={pending} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {transitions.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>სტატუსის შეცვლა</DropdownMenuLabel>
              {transitions.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => run(() => changeAppointmentStatus({ appointmentId: row.id, status }))}
                >
                  {appointmentStatusLabel(status)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          {(canReschedule || canCancel) && transitions.length > 0 && <DropdownMenuSeparator />}
          {canReschedule && (
            <DropdownMenuItem onClick={() => setDialog("reschedule")}>
              <CalendarClock />
              გადატანა
            </DropdownMenuItem>
          )}
          {canCancel && (
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("cancel")}>
              <Ban />
              გაუქმება
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className={dialog === "reschedule" ? "sm:max-w-2xl" : "sm:max-w-md"}>
          {dialog === "cancel" && <CancelForm row={row} onDone={close} />}
          {dialog === "reschedule" && <RescheduleForm row={row} today={today} onDone={close} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      try {
        const res = await action();
        setResult(res);
        if (res.ok) {
          toast.success(res.message);
          onDone();
          router.refresh();
        } else if (!res.fieldErrors) {
          toast.error(res.error);
        }
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const formError = result && !result.ok && !result.fieldErrors ? result.error : undefined;
  return { run, pending, errors, formError };
}

function Who({ row }: { row: AppointmentRow }) {
  return (
    <>
      <b>{row.patient.name}</b> — {row.doctor.name}, {formatDate(row.date)} {row.start}
    </>
  );
}

export function CancelForm({ row, onDone }: { row: AppointmentRow; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { run, pending, errors, formError } = useSubmit(onDone);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => cancelAppointment({ appointmentId: row.id, reason }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>ჯავშნის გაუქმება</DialogTitle>
        <DialogDescription>
          <Who row={row} />. ჯავშანი სიაში დარჩება „გაუქმებულის“ აღნიშვნით, დრო კი გათავისუფლდება.
        </DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField id="appointment-cancel-reason" label="გაუქმების მიზეზი *" error={errors.reason}>
        <Textarea
          id="appointment-cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
          rows={3}
          maxLength={500}
          aria-invalid={errors.reason ? true : undefined}
          placeholder="მაგ. პაციენტმა დარეკა და გააუქმა"
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "მიმდინარეობს..." : "ჯავშნის გაუქმება"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RescheduleForm({ row, today, onDone }: { row: AppointmentRow; today: string; onDone: () => void }) {
  const [date, setDate] = useState(row.date < today ? today : row.date);
  const [slot, setSlot] = useState<Slot | null>(null);
  const slots = useDoctorSlots({ doctorId: row.doctor.id, date, patientId: row.patient.id, excludeAppointmentId: row.id });
  const { run, pending, formError } = useSubmit(onDone);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (slot) run(() => rescheduleAppointment({ appointmentId: row.id, start: slot.start }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>ჯავშნის გადატანა</DialogTitle>
        <DialogDescription>
          <Who row={row} />. აირჩიეთ ახალი თარიღი და დრო (იმავე ექიმთან).
        </DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField id="reschedule-date" label="თარიღი">
        <Input
          id="reschedule-date"
          type="date"
          value={date}
          min={today}
          max={addDays(today, BOOKING_HORIZON_DAYS)}
          onChange={(e) => {
            if (!e.target.value) return;
            setDate(e.target.value);
            setSlot(null);
          }}
          className="h-10 w-52"
        />
      </FormField>
      <div className="max-h-80 overflow-y-auto">
        <SlotGrid state={slots} value={slot?.start ?? null} onSelect={setSlot} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" disabled={pending || !slot}>
          {pending ? "მიმდინარეობს..." : slot ? `გადატანა: ${formatDate(date)} ${slot.time}` : "აირჩიეთ დრო"}
        </Button>
      </DialogFooter>
    </form>
  );
}
