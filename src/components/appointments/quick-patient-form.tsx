"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAppointmentPatient } from "@/lib/appointment-actions";
import { type BookingPatient, type BookingPatientValues, bookingPatientSchema } from "@/lib/appointment-schema";
import { EMPTY_PATIENT, GENDERS } from "@/lib/patient-schema";
import { transliterate } from "@/lib/transliterate";
import { fieldErrorsOf } from "@/lib/zod-errors";
import { NewPatientPolicy } from "@/modules/finance/components/new-patient-policy";
import { EMPTY_POLICY_DRAFT, newPatientPolicySchema, type PolicyDraft, policyDraftInput } from "@/modules/finance/schema";

type TextField = "personalId" | "firstName" | "lastName" | "firstNameEn" | "lastNameEn" | "birthDate" | "phone" | "actualAddress";

/** ქართული ველი → ლათინური, რომელიც აკრეფისას ავტომატურად ივსება (თუ ხელით არ შეუცვლიათ). */
const TRANSLITERATED: Partial<Record<TextField, TextField>> = { firstName: "firstNameEn", lastName: "lastNameEn" };

/** ძებნის ტექსტიდან წინასწარი მნიშვნელობები: პირადი ნომერი, ტელეფონი ან სახელი და გვარი. */
export function prefillFromQuery(query: string): Partial<BookingPatientValues> {
  const q = query.trim();
  const digits = q.replace(/\D/g, "");
  if (/^\d{11}$/.test(q)) return { personalId: q };
  if (/^\+?[\d\s()-]+$/.test(q) && digits.length >= 9) return { phone: q };
  if (/^[ა-ჿ\s-]+$/.test(q)) {
    const [firstName, ...rest] = q.split(/\s+/);
    const lastName = rest.join(" ");
    return { firstName, lastName, firstNameEn: transliterate(firstName), lastNameEn: transliterate(lastName) };
  }
  return {};
}

/**
 * ახალი პაციენტის სწრაფი რეგისტრაცია ჯავშნის გვერდზე: მხოლოდ ჯავშნისთვის საჭირო ველები.
 * სრული მონაცემები შემდეგ პაციენტის ბარათში ივსება.
 */
export function QuickPatientForm({
  initialValues,
  insuranceCompanies,
  onCreated,
  onCancel,
}: {
  initialValues: Partial<BookingPatientValues>;
  /** პოლისის დამატება რეგისტრაციისას; არ არის — დაზღვევის ბლოკი არ ჩანს (უფლება არ აქვს) */
  insuranceCompanies?: { id: number; name: string }[];
  onCreated: (patient: BookingPatient) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<BookingPatientValues>({ ...EMPTY_PATIENT, ...initialValues });
  const [policy, setPolicy] = useState<PolicyDraft>(EMPTY_POLICY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function set(key: TextField, value: string) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      const latinKey = TRANSLITERATED[key];
      if (latinKey && (v[latinKey] === "" || v[latinKey] === transliterate(v[key] ?? ""))) next[latinKey] = transliterate(value);
      return next;
    });
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = bookingPatientSchema.safeParse(values);
    const policyInput = insuranceCompanies ? policyDraftInput(policy) : null;
    const parsedPolicy = policyInput ? newPatientPolicySchema.safeParse(policyInput) : null;
    if (!parsed.success || (parsedPolicy && !parsedPolicy.success)) {
      setErrors({
        ...(parsed.success ? {} : fieldErrorsOf(parsed.error)),
        ...(parsedPolicy && !parsedPolicy.success ? fieldErrorsOf(parsedPolicy.error) : {}),
      });
      setFormError(undefined);
      return;
    }
    startTransition(async () => {
      try {
        const res = await registerAppointmentPatient(values, policyInput);
        if (res.ok) {
          toast.success(res.message);
          onCreated(res.patient);
        } else {
          setErrors(res.fieldErrors ?? {});
          setFormError(res.fieldErrors ? undefined : res.error);
        }
      } catch {
        toast.error("პაციენტი ვერ დარეგისტრირდა. სცადეთ თავიდან");
      }
    });
  }

  const field = (key: TextField, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`qp-${key}`} label={label} error={errors[key]}>
      <Input
        id={`qp-${key}`}
        value={values[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors[key] ? true : undefined}
        autoComplete="off"
        className="h-10"
        {...props}
      />
    </FormField>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border border-dashed p-4">
      <div>
        <h3 className="font-medium">ახალი პაციენტის რეგისტრაცია</h3>
        <p className="text-xs text-muted-foreground">* — სავალდებულო ველები. დანარჩენი მონაცემები პაციენტის ბარათში შეივსება.</p>
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field("personalId", "პირადი ნომერი *", { inputMode: "numeric", maxLength: 11, className: "h-10 font-mono tracking-wider", autoFocus: true })}
        {field("firstName", "სახელი *")}
        {field("lastName", "გვარი *")}
        {field("firstNameEn", "First Name *")}
        {field("lastNameEn", "Last Name *")}
        {field("birthDate", "დაბადების თარიღი *", { type: "date" })}
        <FormField id="qp-gender" label="სქესი *" error={errors.gender}>
          <SegmentedChoice
            id="qp-gender"
            items={GENDERS}
            value={values.gender}
            onChange={(gender) => {
              setValues((v) => ({ ...v, gender }));
              setErrors((e) => ({ ...e, gender: "" }));
            }}
            invalid={!!errors.gender}
          />
        </FormField>
        {field("phone", "ტელეფონი *", { type: "tel", placeholder: "მაგ. 555 12 34 56" })}
        {field("actualAddress", "მისამართი")}
      </div>

      {insuranceCompanies && (
        <NewPatientPolicy value={policy} onChange={setPolicy} companies={insuranceCompanies} errors={errors} disabled={pending} />
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          <UserPlus />
          {pending ? "ინახება..." : "დარეგისტრირება და არჩევა"}
        </Button>
      </div>
    </form>
  );
}
