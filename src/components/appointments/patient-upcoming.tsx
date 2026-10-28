"use client";

import { useEffect, useState } from "react";
import { Ban, CalendarClock, CalendarDays, DoorOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { patientUpcomingAppointments } from "@/lib/appointment-actions";
import type { AppointmentRow } from "@/lib/appointment-schema";
import { formatDate, weekdayName } from "@/lib/appointment-slots";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { CancelForm, RescheduleForm } from "./appointment-row-actions";

/**
 * პაციენტის მომავალი ჯავშნები (ქოლ ცენტრი): „როდის მაქვს ჩაწერა?“ — გადატანა (იმავე ექიმთან) და გაუქმება მიზეზით.
 * reloadKey — ახალი ჯავშნის შემდეგ სია თავიდან; onChanged — გადატანა/გაუქმების შემდეგ (სლოტების განახლებისთვის).
 */
export function PatientUpcoming({
  patientId,
  today,
  reloadKey,
  onChanged,
}: {
  patientId: number;
  today: string;
  reloadKey: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<{ patientId: number; key: number; list: AppointmentRow[] } | null>(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<{ kind: "cancel" | "reschedule"; row: AppointmentRow } | null>(null);
  const key = reloadKey * 1000 + version;

  useEffect(() => {
    let current = true;
    patientUpcomingAppointments(patientId)
      .then((list) => current && setRows({ patientId, key, list }))
      .catch(() => current && setRows({ patientId, key, list: [] }));
    return () => {
      current = false;
    };
  }, [patientId, key]);

  function done() {
    setDialog(null);
    setVersion((v) => v + 1);
    onChanged();
  }

  // სხვა პაციენტის ან ძველი პასუხი — იტვირთება
  const loading = !rows || rows.patientId !== patientId || rows.key !== key;

  return (
    <section className="flex flex-col gap-2" aria-live="polite">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <CalendarDays className="size-4" />
        მომავალი ჯავშნები
        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </h3>
      {!rows || rows.patientId !== patientId ? null : rows.list.length === 0 ? (
        <p className="text-sm text-muted-foreground">მომავალი ჯავშანი არ აქვს</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3 py-2">
              <span className="min-w-40 font-medium tabular-nums">
                {r.date === today ? "დღეს" : `${formatDate(r.date)}, ${weekdayName(r.date)}`} · {r.start}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                {r.doctor.name} <span className="text-muted-foreground">· {r.doctor.specialty}</span>
                {r.doctor.room && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <DoorOpen className="size-3.5" />
                    კაბ. {r.doctor.room}
                  </span>
                )}
              </span>
              <AppointmentStatusBadge status={r.status} />
              {r.status === "booked" && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "reschedule", row: r })}>
                    <CalendarClock />
                    გადატანა
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDialog({ kind: "cancel", row: r })}>
                    <Ban />
                    გაუქმება
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className={dialog?.kind === "reschedule" ? "sm:max-w-2xl" : "sm:max-w-md"}>
          {dialog?.kind === "cancel" && <CancelForm row={dialog.row} onDone={done} />}
          {dialog?.kind === "reschedule" && <RescheduleForm row={dialog.row} today={today} onDone={done} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
