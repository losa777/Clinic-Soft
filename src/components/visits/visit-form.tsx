"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Stethoscope, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatGel, fromTetri, toTetri } from "@/lib/money";
import { createVisit, updateVisit, type VisitSaveResult } from "@/lib/visit-actions";
import {
  type DoctorOption,
  localToIso,
  PAYMENT_METHODS,
  type PaymentMethod,
  type SelectedService,
  type ServiceOption,
  type VisitEditData,
  VISIT_TYPES,
  type VisitType,
  visitSchema,
  visitUpdateSchema,
} from "@/lib/visit-schema";
import { fieldErrorsOf } from "@/lib/zod-errors";

type Props = {
  patientId: number;
  services: ServiceOption[];
  doctors: DoctorOption[];
  /** ნაგულისხმევი დრო (სერვერიდან, რომ hydration-ისას არ განსხვავდებოდეს) */
  defaultVisitAt: string;
  /** შენახვის შემდეგ გადასასვლელი გვერდი (პაციენტის ვიზიტები) */
  doneHref: string;
  /** რედაქტირება; არ არის — ახალი მიღება */
  edit?: VisitEditData;
};

/** პაციენტის მიღება ან ვიზიტის რედაქტირება: ექიმი, დრო, სერვისები, გადახდა, კომენტარი. */
export function VisitForm({ patientId, services, doctors, defaultVisitAt, doneHref, edit }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedService[]>(edit?.items ?? []);
  const [doctor, setDoctor] = useState<DoctorOption | null>(edit?.doctor ?? null);
  const [visitAt, setVisitAt] = useState(edit?.visitAt ?? defaultVisitAt);
  const [visitType, setVisitType] = useState<VisitType>(edit?.visitType ?? "outpatient");
  // გადახდილი თანხა ჯამს მიჰყვება, სანამ ხელით არ შეცვლიან (რედაქტირებისას არ იცვლება)
  const [paid, setPaid] = useState<string | null>(edit?.paidAmount ?? null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [comment, setComment] = useState(edit?.comment ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();

  const totalTetri = selected.reduce((sum, s) => sum + toTetri(s.price), 0);
  const total = fromTetri(totalTetri);
  const paidValue = paid ?? total;
  const debtTetri = totalTetri - toTetri(paidValue || "0");

  const selectedIds = new Set(selected.map((s) => s.serviceId));
  const serviceItems: PickerItem[] = services
    .filter((s) => !selectedIds.has(s.id))
    .map((s) => ({ id: s.id, label: s.code ? `${s.code} — ${s.name}` : s.name, detail: formatGel(s.price) }));
  const doctorItems: PickerItem[] = doctors.map((d) => ({ id: d.id, label: d.name }));

  function clearError(key: string) {
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  /** ფორმის საწყის მდგომარეობაში დაბრუნება (Next.js ნანახ გვერდებს მეხსიერებაში ინახავს — ძველი არჩევანი არ უნდა დარჩეს). */
  function reset() {
    setSelected([]);
    setDoctor(null);
    setVisitAt(defaultVisitAt);
    setVisitType("outpatient");
    setPaid(null);
    setPaymentMethod("cash");
    setComment("");
    setErrors({});
  }

  function addService(item: PickerItem) {
    const service = services.find((s) => s.id === item.id);
    if (service) {
      setSelected((list) => [
        ...list,
        { key: `s-${service.id}`, serviceId: service.id, code: service.code, name: service.name, price: service.price },
      ]);
    }
    clearError("serviceIds");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const common = {
      doctorId: doctor?.id ?? 0,
      visitAt: visitAt ? localToIso(visitAt) : "",
      visitType,
      comment,
    };
    const createInput = {
      ...common,
      patientId,
      serviceIds: selected.map((s) => s.serviceId ?? 0),
      paidAmount: paidValue,
      paymentMethod,
    };
    const updateInput = edit && {
      ...common,
      visitId: edit.visitId,
      items: selected.map((s) => (s.visitServiceId ? { visitServiceId: s.visitServiceId } : { serviceId: s.serviceId ?? 0 })),
    };

    const parsed = updateInput ? visitUpdateSchema.safeParse(updateInput) : visitSchema.safeParse(createInput);
    const clientErrors = parsed.success ? {} : fieldErrorsOf(parsed.error);
    if (clientErrors.items) clientErrors.serviceIds = clientErrors.items;
    if (debtTetri < 0) {
      if (edit) clientErrors.serviceIds = "ახალი ჯამი გადახდილ თანხაზე ნაკლებია";
      else clientErrors.paidAmount = "გადახდილი თანხა ჯამს აღემატება";
    }
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      toast.error("შეასწორეთ მონიშნული ველები");
      return;
    }

    startSaving(async () => {
      let res: VisitSaveResult;
      try {
        res = updateInput ? await updateVisit(updateInput) : await createVisit(createInput);
      } catch {
        toast.error("შენახვა ვერ მოხერხდა. სცადეთ თავიდან");
        return;
      }
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "შენახვა ვერ მოხერხდა");
        return;
      }
      toast.success(res.message);
      if (!edit) reset();
      router.push(doneHref);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ექიმი და დრო</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField id="visit-type" label="მიღების ტიპი *" error={errors.visitType}>
              <SegmentedChoice
                id="visit-type"
                items={VISIT_TYPES}
                value={visitType}
                onChange={(v) => {
                  setVisitType(v);
                  clearError("visitType");
                }}
                invalid={!!errors.visitType}
              />
            </FormField>
            <FormField id="visit-doctor" label="ექიმი *" error={errors.doctorId}>
              {doctor ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border px-3">
                  <Stethoscope className="size-4 text-primary" />
                  <span className="flex-1 truncate font-medium">{doctor.name}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDoctor(null)}>
                    შეცვლა
                  </Button>
                </div>
              ) : (
                <SearchPicker
                  id="visit-doctor"
                  items={doctorItems}
                  onSelect={(item) => {
                    setDoctor(doctors.find((d) => d.id === item.id) ?? null);
                    clearError("doctorId");
                  }}
                  placeholder="მოძებნეთ ექიმი სახელით ან გვარით"
                  emptyText={doctors.length ? "ექიმი ვერ მოიძებნა" : "სისტემაში აქტიური ექიმი არ არის"}
                  invalid={!!errors.doctorId}
                />
              )}
            </FormField>
            <FormField id="visit-at" label="ვიზიტის თარიღი და დრო *" error={errors.visitAt}>
              <Input
                id="visit-at"
                type="datetime-local"
                value={visitAt}
                onChange={(e) => {
                  setVisitAt(e.target.value);
                  clearError("visitAt");
                }}
                aria-invalid={errors.visitAt ? true : undefined}
                className="h-10"
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>გადახდა</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">ჯამი</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatGel(total)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">დავალიანება</dt>
                <dd className={`text-2xl font-semibold tabular-nums ${debtTetri > 0 ? "text-destructive" : ""}`}>
                  {formatGel(fromTetri(Math.max(0, debtTetri)))}
                </dd>
              </div>
            </dl>
            {edit ? (
              <p className="text-sm text-muted-foreground">
                გადახდილია: <b className="text-foreground tabular-nums">{formatGel(edit.paidAmount)}</b>. ახალი თანხა ემატება
                ვიზიტის ბარათიდან („გადახდის დამატება“).
              </p>
            ) : (
              <>
                <FormField id="visit-paid" label="გადახდილი თანხა (₾) *" error={errors.paidAmount} hint="ნაგულისხმევად — სრული ჯამი">
                  <Input
                    id="visit-paid"
                    value={paidValue}
                    onChange={(e) => {
                      setPaid(e.target.value);
                      clearError("paidAmount");
                    }}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={errors.paidAmount ? true : undefined}
                    className="h-10 tabular-nums"
                  />
                </FormField>
                <FormField id="visit-payment-method" label="გადახდის ფორმა *" error={errors.paymentMethod}>
                  <SegmentedChoice
                    id="visit-payment-method"
                    items={PAYMENT_METHODS}
                    value={paymentMethod}
                    onChange={(v) => {
                      setPaymentMethod(v);
                      clearError("paymentMethod");
                    }}
                    invalid={!!errors.paymentMethod}
                  />
                </FormField>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>სერვისები</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FormField id="visit-services" label="სერვისის დამატება *" error={errors.serviceIds}>
            <SearchPicker
              id="visit-services"
              items={serviceItems}
              onSelect={addService}
              placeholder="მოძებნეთ სერვისი ICD-10 კოდით ან დასახელებით"
              emptyText={services.length ? "სერვისი ვერ მოიძებნა" : "სერვისები ჯერ არ არის დამატებული"}
              invalid={!!errors.serviceIds}
              autoFocus={!edit}
            />
          </FormField>

          {selected.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {selected.map((s) => (
                <li key={s.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-24 shrink-0 font-mono text-sm text-muted-foreground">{s.code ?? "—"}</span>
                  <span className="flex-1">{s.name}</span>
                  <span className="tabular-nums">{formatGel(s.price)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSelected((list) => list.filter((x) => x.key !== s.key))}
                    aria-label={`${s.name} — წაშლა`}
                    title="წაშლა"
                    className="text-destructive hover:text-destructive"
                  >
                    <X />
                  </Button>
                </li>
              ))}
              <li className="flex items-center gap-3 bg-muted/50 px-3 py-2 font-semibold">
                <span className="w-24 shrink-0" />
                <span className="flex-1">ჯამი</span>
                <span className="tabular-nums">{formatGel(total)}</span>
                <span className="size-7" />
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">სერვისი ჯერ არ არის არჩეული</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>კომენტარი</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField id="visit-comment" label="კომენტარი" error={errors.comment}>
            <Textarea
              id="visit-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="min-h-20"
            />
          </FormField>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            if (!edit) reset();
            router.push(doneHref);
          }}
          disabled={saving}
        >
          გაუქმება
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "ინახება..." : edit ? "ცვლილებების შენახვა" : "მიღების შენახვა"}
        </Button>
      </div>
    </form>
  );
}
