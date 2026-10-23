"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, FileText, FlaskConical, Pill, Printer, Send, Syringe, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { documentUrl } from "@/lib/patient-schema";
import {
  addOrderAction,
  addPrescriptionAction,
  cancelOrderAction,
  deletePrescriptionAction,
} from "@/modules/emr/actions/orders-actions";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, type OrderTypeCode, type PrescriptionInput } from "@/modules/emr/schema";
import type { EncounterOrders, OrderOption } from "@/modules/emr/server/orders";

const ORDER_ICONS = { lab: FlaskConical, instrumental: FileText, procedure: Syringe } as const;

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message);
        onSuccess?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }
  return { run, pending };
}

/**
 * „დანიშნულებები“: რეცეპტი (ალერგიის შემოწმებით, ბეჭდვით), ლაბორატორიული/ინსტრუმენტული კვლევები (→ ლაბორანტი),
 * ექთნის პროცედურები (→ ექთანი), მიმართვა და განმეორებითი ვიზიტი (ჯავშნის მოდულით).
 * editable — საკუთარი, დაუსრულებელი ვიზიტი.
 */
export function OrdersPanel({
  encounterId,
  editable,
  data,
  options,
  printHref,
  bookingHrefs,
}: {
  encounterId: number;
  editable: boolean;
  data: EncounterOrders;
  options: Record<OrderTypeCode, OrderOption[]>;
  printHref: string;
  bookingHrefs: { followup: string; referral: string } | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {bookingHrefs && <BookingLinks hrefs={bookingHrefs} />}
      <Prescriptions encounterId={encounterId} editable={editable} items={data.prescriptions} printHref={printHref} />
      <div className="grid gap-4 xl:grid-cols-3">
        {(Object.keys(ORDER_TYPE_LABELS) as OrderTypeCode[]).map((type) => (
          <OrderSection
            key={type}
            type={type}
            encounterId={encounterId}
            editable={editable}
            items={data.orders.filter((o) => o.type === type)}
            options={options[type]}
          />
        ))}
      </div>
    </div>
  );
}

/** მიმართვა / განმეორებითი ვიზიტი — ჯავშნის მოდულით (პაციენტი წინასწარ არჩეულია). */
export function BookingLinks({ hrefs }: { hrefs: { followup: string; referral: string } }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={hrefs.followup} className={buttonVariants({ variant: "outline" })}>
        <CalendarPlus />
        განმეორებითი ვიზიტი
      </Link>
      <Link href={hrefs.referral} className={buttonVariants({ variant: "outline" })}>
        <Send />
        მიმართვა სპეციალისტთან
      </Link>
    </div>
  );
}

const EMPTY_RX = { drugName: "", dose: "", form: "", frequency: "", duration: "", note: "", quantity: "", rxNumber: "" };

function Prescriptions({
  encounterId,
  editable,
  items,
  printHref,
}: {
  encounterId: number;
  editable: boolean;
  items: EncounterOrders["prescriptions"];
  printHref: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY_RX);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [warning, setWarning] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();
  const remove = useRun();
  const errors = failure?.fieldErrors ?? {};
  const set = (key: keyof typeof EMPTY_RX) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(acknowledgeAllergy: boolean) {
    const input: PrescriptionInput = { encounterId, ...values, acknowledgeAllergy };
    startTransition(async () => {
      try {
        const res = await addPrescriptionAction(input);
        if (res.ok) {
          toast.success(res.message);
          setValues(EMPTY_RX);
          setFailure(null);
          setWarning(null);
          router.refresh();
        } else if (res.allergyWarning) {
          setWarning(res.allergyWarning);
        } else {
          setFailure(res);
          if (!res.fieldErrors) toast.error(res.error);
        }
      } catch {
        toast.error("მედიკამენტი ვერ დაინიშნა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <Pill className="size-4 text-muted-foreground" />
        <CardTitle>რეცეპტი</CardTitle>
        {items.length > 0 && (
          <Link href={printHref} target="_blank" className={buttonVariants({ variant: "outline", size: "sm", className: "ml-auto" })}>
            <Printer />
            ბეჭდვა
          </Link>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">მედიკამენტი არ არის დანიშნული.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {items.map((p, i) => (
              <li key={p.id} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.drugName}
                    {p.form && <span className="font-normal text-muted-foreground"> ({p.form})</span>}
                  </p>
                  <p className="text-muted-foreground">
                    {[p.dose, p.frequency, p.duration].filter(Boolean).join(" · ")}
                    {p.note && ` — ${p.note}`}
                    {(p.quantity || p.rxNumber) && (
                      <span className="block text-xs">
                        {[p.quantity && `რაოდენობა: ${p.quantity}`, p.rxNumber && `რეცეპტი № ${p.rxNumber}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </p>
                </div>
                {editable && (
                  <button
                    type="button"
                    disabled={remove.pending}
                    onClick={() => remove.run(() => deletePrescriptionAction(p.id))}
                    className="rounded-sm text-muted-foreground hover:text-foreground"
                    aria-label={`${p.drugName}: მოხსნა`}
                    title="მოხსნა"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}

        {editable && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
            noValidate
            className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <FormField id="rx-drug" label="მედიკამენტი *" error={errors.drugName}>
              <Input id="rx-drug" value={values.drugName} onChange={set("drugName")} placeholder="მაგ. ამოქსიცილინი" className="h-9" />
            </FormField>
            <FormField id="rx-dose" label="დოზა *" error={errors.dose}>
              <Input id="rx-dose" value={values.dose} onChange={set("dose")} placeholder="500 მგ" className="h-9" />
            </FormField>
            <FormField id="rx-form" label="ფორმა" error={errors.form}>
              <Input id="rx-form" value={values.form} onChange={set("form")} placeholder="ტაბლეტი" className="h-9" />
            </FormField>
            <FormField id="rx-frequency" label="მიღების სიხშირე *" error={errors.frequency}>
              <Input id="rx-frequency" value={values.frequency} onChange={set("frequency")} placeholder="დღეში 3-ჯერ" className="h-9" />
            </FormField>
            <FormField id="rx-duration" label="ხანგრძლივობა" error={errors.duration}>
              <Input id="rx-duration" value={values.duration} onChange={set("duration")} placeholder="7 დღე" className="h-9" />
            </FormField>
            <FormField id="rx-note" label="შენიშვნა" error={errors.note}>
              <Input id="rx-note" value={values.note} onChange={set("note")} placeholder="ჭამის შემდეგ" className="h-9" />
            </FormField>
            <FormField id="rx-quantity" label="რაოდენობა" error={errors.quantity}>
              <Input id="rx-quantity" value={values.quantity} onChange={set("quantity")} inputMode="numeric" placeholder="1" className="h-9" />
            </FormField>
            <FormField id="rx-number" label="რეცეპტის ნომერი" error={errors.rxNumber}>
              <Input id="rx-number" value={values.rxNumber} onChange={set("rxNumber")} className="h-9" />
            </FormField>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={pending}>
                <Pill />
                {pending ? "ინახება..." : "დანიშვნა"}
              </Button>
            </div>
          </form>
        )}

        <ConfirmDialog
          open={warning !== null}
          onOpenChange={(open) => !open && setWarning(null)}
          title="ალერგიის გაფრთხილება"
          description={
            <>
              პაციენტს ჩაწერილი აქვს ალერგია: <b className="text-destructive">{warning?.join(", ")}</b>. „{values.drugName}“ შეიძლება
              ამ ჯგუფს ეკუთვნოდეს. მაინც დაინიშნოს? (დადასტურება აუდიტში ჩაიწერება)
            </>
          }
          confirmLabel="მაინც დანიშვნა"
          pending={pending}
          onConfirm={() => submit(true)}
        />
      </CardContent>
    </Card>
  );
}

function OrderSection({
  type,
  encounterId,
  editable,
  items,
  options,
}: {
  type: OrderTypeCode;
  encounterId: number;
  editable: boolean;
  items: EncounterOrders["orders"];
  options: OrderOption[];
}) {
  const Icon = ORDER_ICONS[type];
  const [selected, setSelected] = useState<PickerItem | null>(null);
  const [note, setNote] = useState("");
  const { run, pending } = useRun();
  const pickerItems = options.map((o) => ({ id: o.id, label: o.label, detail: o.category }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle>{ORDER_TYPE_LABELS[type]}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">არ არის დანიშნული.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((o) => (
              <li key={o.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium">{o.name}</p>
                  <Badge variant={o.status === "cancelled" ? "outline" : o.status === "ordered" || o.status === "sample_taken" ? "secondary" : "default"}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </Badge>
                  {editable && o.status === "ordered" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => cancelOrderAction(o.id))}
                      className="rounded-sm text-muted-foreground hover:text-foreground"
                      aria-label={`${o.name}: გაუქმება`}
                      title="გაუქმება"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                {o.note && <p className="text-xs text-muted-foreground">{o.note}</p>}
                {o.performedAt && (
                  <p className="text-xs text-muted-foreground">
                    {o.performedBy} · {o.performedAt}
                  </p>
                )}
                {o.resultText && <p className="mt-1 whitespace-pre-line">{o.resultText}</p>}
                {o.resultDocumentId && (
                  <a href={documentUrl(o.resultDocumentId)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                    <FileText className="size-4" />
                    შედეგის ფაილი
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable &&
          (options.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              სერვისები არ არის — ადმინმა სერვისების კატეგორიას უნდა მიუთითოს დანიშნულების ტიპი „{ORDER_TYPE_LABELS[type]}“.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selected) return toast.error("აირჩიეთ სერვისი");
                run(() => addOrderAction({ encounterId, serviceId: selected.id, type, note }), () => {
                  setSelected(null);
                  setNote("");
                });
              }}
              noValidate
              className="flex flex-col gap-2 rounded-lg border border-dashed p-2.5"
            >
              {selected ? (
                <p className="flex items-center gap-2 text-sm">
                  <b className="min-w-0 flex-1">{selected.label}</b>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setSelected(null)}>
                    შეცვლა
                  </Button>
                </p>
              ) : (
                <SearchPicker id={`order-${type}`} items={pickerItems} onSelect={setSelected} placeholder="მოძებნეთ სერვისი..." closeOnSelect />
              )}
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="შენიშვნა (არასავალდებულო)" className="h-9" aria-label="შენიშვნა" />
              <Button type="submit" size="sm" disabled={pending || !selected}>
                {pending ? "ინახება..." : "დანიშვნა"}
              </Button>
            </form>
          ))}
      </CardContent>
    </Card>
  );
}
