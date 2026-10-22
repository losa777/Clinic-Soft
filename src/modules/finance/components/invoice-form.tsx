"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Save, ShieldCheck, ShieldOff, Stethoscope, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMinutes, tbilisiParts } from "@/lib/appointment-slots";
import { formatGel } from "@/lib/money";
import { fieldErrorsOf } from "@/lib/zod-errors";
import { createInvoiceAction } from "@/modules/finance/actions/invoice-actions";
import { calcLine, fromTetri, type LineAmounts, sumLines, toTetri } from "@/modules/finance/calc";
import { type FinanceRoutes, invoiceUrl } from "@/modules/finance/routes";
import { type InvoiceInput, invoiceSchema } from "@/modules/finance/schema";
import { type InvoiceFormData, VISIT_TYPES, type VisitType } from "@/modules/finance/types";
import { DebtBadge } from "./invoice-status-badge";

type Line = { serviceId: number; quantity: string; discountPercent: string };

/** ISO → "2026-10-22T14:30" თბილისის დროით (datetime-local ველისთვის). */
function toLocalInput(iso: string) {
  const { date, minutes } = tbilisiParts(new Date(iso));
  return `${date}T${formatMinutes(minutes)}`;
}

/** კლიენტზე გამოთვლა მხოლოდ საჩვენებლადაა — შენახვისას სერვერი თავიდან ითვლის ბაზის ფასებით. */
function safeLine(unitPrice: string, line: Line, coverage: InvoiceFormData["coverage"][number] | null): LineAmounts | null {
  try {
    return calcLine({
      unitPrice: toTetri(unitPrice),
      quantity: Number(line.quantity),
      discountPercent: line.discountPercent.replace(",", ".") || "0",
      coverage,
    });
  } catch {
    return null;
  }
}

/**
 * ახალი ინვოისი: სერვისები (ძებნით), რაოდენობა, ფასდაკლება; დაზღვევის წილი პაციენტის აქტიური პოლისით
 * (შეიძლება ხელით გამოირთოს მიზეზით). ჯავშნიდან — ექიმი და კონსულტაციის სერვისი ავტომატურად.
 */
export function InvoiceForm({ data, routes }: { data: InvoiceFormData; routes: FinanceRoutes }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() => data.initialServiceIds.map((serviceId) => ({ serviceId, quantity: "1", discountPercent: "0" })));
  const [visitType, setVisitType] = useState<VisitType>("outpatient");
  const [doctor, setDoctor] = useState(data.doctor);
  const [serviceDate, setServiceDate] = useState(() => toLocalInput(data.defaultServiceDate));
  const [disableInsurance, setDisableInsurance] = useState(false);
  const [disableReason, setDisableReason] = useState("");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();

  const services = useMemo(() => new Map(data.services.map((s) => [s.id, s])), [data.services]);
  // ჯავშნის გარეშე ექიმით — პაციენტი ექიმის მომლოდინეთა რიგში ჩადგება
  const doctorHint = data.appointment
    ? undefined
    : !doctor
      ? "არასავალდებულო; არჩევისას პაციენტი ექიმის რიგში ჩადგება"
      : data.doctors.find((d) => d.id === doctor.id)?.queue
        ? "პაციენტი ექიმის მომლოდინეთა რიგში ჩადგება („მობრძანდა“)"
        : "ექიმს განრიგი არ აქვს — რიგში ვერ ჩადგება";
  const insured = data.policy !== null && !disableInsurance;

  const computed = lines.map((l) => {
    const s = services.get(l.serviceId)!;
    return { line: l, service: s, amounts: safeLine(s.price, l, insured ? (data.coverage[s.id] ?? null) : null) };
  });
  const totals = sumLines(computed.flatMap((c) => (c.amounts ? [c.amounts] : [])));

  const selected = new Set(lines.map((l) => l.serviceId));
  const serviceItems: PickerItem[] = data.services
    .filter((s) => !selected.has(s.id))
    .map((s) => ({
      id: s.id,
      label: s.code ? `${s.code} — ${s.name}` : s.name,
      detail: formatGel(s.price),
      keywords: s.category ?? "",
    }));

  function updateLine(serviceId: number, patch: Partial<Line>) {
    setLines((list) => list.map((l) => (l.serviceId === serviceId ? { ...l, ...patch } : l)));
    setErrors((e) => ({ ...e, items: "" }));
  }

  if (data.existingInvoice) {
    return (
      <Alert>
        <AlertTitle>ამ ჯავშანზე ინვოისი უკვე შექმნილია: {data.existingInvoice.number}</AlertTitle>
        <AlertDescription className="pt-2">
          <Link href={invoiceUrl(routes, data.existingInvoice.id)} className={buttonVariants({ variant: "outline" })}>
            ინვოისის გახსნა
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: InvoiceInput = {
      patientId: data.patient.id,
      appointmentId: data.appointment?.id ?? null,
      doctorId: doctor?.id ?? null,
      visitType,
      serviceDate: serviceDate ? `${serviceDate}:00+04:00` : "",
      items: lines.map((l) => ({
        serviceId: l.serviceId,
        quantity: Number(l.quantity),
        discountPercent: l.discountPercent || "0",
      })),
      disableInsurance: data.policy !== null && disableInsurance,
      disableInsuranceReason: disableReason,
      comment,
    };
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      toast.error("შეასწორეთ მონიშნული ველები");
      return;
    }
    startSaving(async () => {
      try {
        const res = await createInvoiceAction(input);
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          toast.error(res.error ?? "ინვოისი ვერ შეიქმნა");
          return;
        }
        toast.success(res.message);
        router.push(invoiceUrl(routes, res.invoiceId));
      } catch {
        toast.error("ინვოისი ვერ შეიქმნა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>მომსახურება</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.appointment && (
              <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <CalendarClock className="size-4 text-muted-foreground" />
                ჯავშანი: {data.appointment.label}
              </p>
            )}
            <FormField id="invoice-visit-type" label="მიღების ტიპი">
              <SegmentedChoice id="invoice-visit-type" items={VISIT_TYPES} value={visitType} onChange={setVisitType} />
            </FormField>
            <FormField id="invoice-doctor" label="ექიმი" error={errors.doctorId} hint={doctorHint}>
              {doctor ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border px-3">
                  <Stethoscope className="size-4 text-primary" />
                  <span className="flex-1 truncate font-medium">{doctor.name}</span>
                  {!data.appointment && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDoctor(null)}>
                      შეცვლა
                    </Button>
                  )}
                </div>
              ) : (
                <SearchPicker
                  id="invoice-doctor"
                  items={data.doctors.map((d) => ({ id: d.id, label: d.name }))}
                  onSelect={(item) => setDoctor(data.doctors.find((d) => d.id === item.id) ?? null)}
                  placeholder="მოძებნეთ ექიმი"
                  emptyText="ექიმი ვერ მოიძებნა"
                  closeOnSelect
                />
              )}
            </FormField>
            <FormField id="invoice-date" label="მომსახურების თარიღი და დრო *" error={errors.serviceDate}>
              <Input
                id="invoice-date"
                type="datetime-local"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="h-10"
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {insured ? <ShieldCheck className="size-5 text-emerald-600" /> : <ShieldOff className="size-5 text-muted-foreground" />}
              დაზღვევა
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.policy ? (
              <>
                <p className="text-sm">
                  <b>{data.policy.companyName}</b> · პოლისი {data.policy.policyNumber}
                  <span className="block text-xs text-muted-foreground">მოქმედებს {data.policy.validTo}-მდე</span>
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={disableInsurance} onCheckedChange={setDisableInsurance} />
                  ამ ინვოისზე დაზღვევის გამორთვა
                </label>
                {disableInsurance && (
                  <FormField id="invoice-disable-reason" label="გამორთვის მიზეზი *" error={errors.disableInsuranceReason}>
                    <Input
                      id="invoice-disable-reason"
                      value={disableReason}
                      onChange={(e) => setDisableReason(e.target.value)}
                      maxLength={500}
                      placeholder="მაგ. სერვისი პოლისით არ ფინანსდება, პაციენტის მოთხოვნა"
                      className="h-10"
                    />
                  </FormField>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                პაციენტს აქტიური პოლისი არ აქვს — ყველაფერს პაციენტი იხდის. პოლისი ემატება პაციენტის ბარათზე („დაზღვევა“).
              </p>
            )}
            <dl className="mt-auto grid grid-cols-2 gap-3 border-t pt-3">
              <Stat label="ჯამი" value={fromTetri(totals.total)} />
              <Stat label="ფასდაკლება" value={fromTetri(totals.discount)} />
              <Stat label="დაზღვევის წილი" value={fromTetri(totals.insurance)} />
              <Stat label="პაციენტის წილი" value={fromTetri(totals.patient)} strong />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>სერვისები</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FormField id="invoice-services" label="სერვისის დამატება *" error={errors.items}>
            <SearchPicker
              id="invoice-services"
              items={serviceItems}
              onSelect={(item) => {
                setLines((list) => [...list, { serviceId: item.id, quantity: "1", discountPercent: "0" }]);
                setErrors((e) => ({ ...e, items: "" }));
              }}
              placeholder="მოძებნეთ სერვისი დასახელებით, ICD-10 კოდით ან კატეგორიით"
              emptyText={data.services.length ? "სერვისი ვერ მოიძებნა" : "აქტიური სერვისები არ არის"}
              invalid={!!errors.items}
              autoFocus={!lines.length}
              closeOnSelect
            />
          </FormField>

          {lines.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-normal">სერვისი</th>
                    <th className="px-2 py-2 text-right font-normal">ფასი</th>
                    <th className="w-20 px-2 py-2 font-normal">რაოდ.</th>
                    <th className="w-24 px-2 py-2 font-normal">ფასდ. %</th>
                    <th className="px-2 py-2 text-right font-normal">ჯამი</th>
                    <th className="px-2 py-2 text-right font-normal">დაზღვევა</th>
                    <th className="px-2 py-2 text-right font-normal">პაციენტი</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {computed.map(({ line, service, amounts }) => (
                    <tr key={line.serviceId}>
                      <td className="px-3 py-2">
                        <p>{service.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[service.code, service.category].filter(Boolean).join(" · ")}
                          {insured && data.coverage[service.id] && ` · დაფარვა ${Number(data.coverage[service.id].percent)}%`}
                          {insured && data.coverage[service.id]?.limit && `, ლიმიტი ${formatGel(data.coverage[service.id].limit!)}`}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatGel(service.price)}</td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.serviceId, { quantity: e.target.value })}
                          aria-label={`${service.name}: რაოდენობა`}
                          className="h-8 tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          inputMode="decimal"
                          value={line.discountPercent}
                          onChange={(e) => updateLine(line.serviceId, { discountPercent: e.target.value })}
                          aria-label={`${service.name}: ფასდაკლება პროცენტებში`}
                          className="h-8 tabular-nums"
                        />
                      </td>
                      {amounts ? (
                        <>
                          <td className="px-2 py-2 text-right tabular-nums">{formatGel(fromTetri(amounts.total))}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatGel(fromTetri(amounts.insurance))}</td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums">{formatGel(fromTetri(amounts.patient))}</td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-2 py-2 text-right text-xs text-destructive">
                          რაოდენობა 1–99, ფასდაკლება 0–100%
                        </td>
                      )}
                      <td className="px-1 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setLines((list) => list.filter((l) => l.serviceId !== line.serviceId))}
                          aria-label={`${service.name} — წაშლა`}
                          className="text-destructive hover:text-destructive"
                        >
                          <X />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">სერვისი ჯერ არ არის დამატებული</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FormField id="invoice-comment" label="კომენტარი" error={errors.comment}>
            <Textarea id="invoice-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={2000} />
          </FormField>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <DebtBadge debt={data.patient.debt} className="mr-auto" />
        <span className="text-sm">
          პაციენტი იხდის: <b className="text-lg tabular-nums">{formatGel(fromTetri(totals.patient))}</b>
        </span>
        <Button type="submit" size="lg" disabled={saving || !lines.length}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "ინახება..." : "ინვოისის შექმნა"}
        </Button>
      </div>
    </form>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-xl font-semibold" : "text-base"}`}>{formatGel(value)}</dd>
    </div>
  );
}
