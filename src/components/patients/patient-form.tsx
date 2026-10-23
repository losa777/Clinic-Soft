"use client";

import { startNavigationProgress } from "@/components/navigation-progress";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Eraser, Loader2, Lock, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addPatientDocuments, findPatient, type PatientSaveResult, savePatient } from "@/lib/patient-actions";
import {
  EMPTY_PATIENT,
  GENDERS,
  MARITAL_STATUSES,
  MAX_TOTAL_UPLOAD,
  type PatientFormValues,
  type PatientRecord,
  PERSONAL_ID_PATTERN,
  patientSchema,
} from "@/lib/patient-schema";
import { transliterate } from "@/lib/transliterate";
import { cn } from "@/lib/utils";
import { fieldErrorsOf } from "@/lib/zod-errors";
import { NewPatientPolicy } from "@/modules/finance/components/new-patient-policy";
import { EMPTY_POLICY_DRAFT, newPatientPolicySchema, type PolicyDraft, policyDraftInput } from "@/modules/finance/schema";
import { DocumentsSection, type PendingDocument, releasePending } from "./documents-section";

/** idle: პირადი ნომერი ჯერ არ შეყვანილა; found/new: ძებნის შედეგი. */
type Lookup = "idle" | "searching" | "found" | "new";

type TextField = Exclude<keyof PatientFormValues, "gender" | "maritalStatus">;

/** ქართული ველი → ლათინური ველი, რომელიც აკრეფისას ავტომატურად ივსება. */
const TRANSLITERATED: Partial<Record<TextField, TextField>> = { firstName: "firstNameEn", lastName: "lastNameEn" };

/** მხოლოდ სანახავი ველი: ტექსტი სრული კონტრასტით, ფონი მიანიშნებს, რომ ველი არ იცვლება. */
const READ_ONLY_CLASS = "cursor-default bg-muted/50 focus-visible:border-input focus-visible:ring-0 dark:bg-muted/30";

type Props = {
  /** არსებული პაციენტის მონაცემების შეცვლა (ადმინი) */
  canEdit: boolean;
  /** სრული ინფორმაციის გვერდი: პაციენტი უკვე ჩატვირთულია, პირადი ნომერი არ იცვლება */
  initialRecord?: PatientRecord;
  /** რეგისტრაციის გვერდი: ძებნიდან გადმოტანილი მნიშვნელობები (11-ციფრიანი ნომერი სერვერზე უკვე შემოწმებულია) */
  initialValues?: Partial<Pick<PatientFormValues, "personalId" | "firstName" | "lastName">>;
  /** პაციენტის გვერდის მისამართი (`${patientHref}/${id}`): ახალი პაციენტის შენახვის შემდეგ და ნაპოვნ პაციენტზე */
  patientHref?: string;
  /** რეგისტრაციისას პოლისის დამატება (აქტიური კომპანიები); არ არის — დაზღვევის ბლოკი არ ჩანს (უფლება არ აქვს) */
  insuranceCompanies?: { id: number; name: string }[];
};

function initialValuesOf({ initialRecord, initialValues }: Props): PatientFormValues {
  if (initialRecord) return initialRecord.values;
  const v = { ...EMPTY_PATIENT, ...initialValues };
  return { ...v, firstNameEn: transliterate(v.firstName), lastNameEn: transliterate(v.lastName) };
}

/**
 * პაციენტის ფორმა: ძებნა პირადი ნომრით, ახალის დამატება ან არსებულის ნახვა/რედაქტირება,
 * დოკუმენტების სკანირება და ატვირთვა.
 */
export function PatientForm(props: Props) {
  const { canEdit, initialRecord, patientHref, insuranceCompanies } = props;
  const router = useRouter();
  const [values, setValues] = useState<PatientFormValues>(() => initialValuesOf(props));
  const [lookup, setLookup] = useState<Lookup>(() =>
    initialRecord ? "found" : PERSONAL_ID_PATTERN.test(props.initialValues?.personalId ?? "") ? "new" : "idle",
  );
  const [record, setRecord] = useState<PatientRecord | null>(initialRecord ?? null);
  const [pending, setPending] = useState<PendingDocument[]>([]);
  const [policy, setPolicy] = useState<PolicyDraft>(EMPTY_POLICY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();
  const personalIdInput = useRef<HTMLInputElement>(null);
  // ბოლოს მოძებნილი ნომერი: მოძველებული პასუხი (ნომერი უკვე შეიცვალა) უგულებელყოფილია
  const searchedId = useRef(values.personalId);
  const lockPersonalId = !!initialRecord;

  // შეუნახავი ფაილები გვერდიდან გასვლისას დაიკარგება — ვაფრთხილებთ
  useEffect(() => {
    if (!pending.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending.length]);

  const readOnly = lookup === "found" && !canEdit;
  // ძებნამდე ველები გათიშულია; ნაპოვნი პაციენტი (რედაქტირების უფლების გარეშე) — readOnly, რომ კარგად იკითხებოდეს
  const fieldsDisabled = lookup === "idle" || lookup === "searching";
  const personalIdReady = PERSONAL_ID_PATTERN.test(values.personalId) && (lookup === "found" || lookup === "new");

  function showRecord(r: PatientRecord) {
    setRecord(r);
    setValues(r.values);
    setLookup("found");
    setErrors({});
  }

  function search(personalId: string) {
    searchedId.current = personalId;
    setLookup("searching");
    findPatient(personalId)
      .then((res) => {
        if (searchedId.current !== personalId) return;
        if (!res.ok) {
          setLookup("idle");
          setErrors({ personalId: res.error });
        } else if (res.record) {
          showRecord(res.record);
        } else {
          setRecord(null);
          setLookup("new");
        }
      })
      .catch(() => {
        if (searchedId.current !== personalId) return;
        setLookup("idle");
        toast.error("პაციენტის ძებნა ვერ მოხერხდა");
      });
  }

  function changePersonalId(raw: string) {
    const personalId = raw.replace(/\D/g, "").slice(0, 11);
    if (personalId === values.personalId) return;
    searchedId.current = "";

    // ნაპოვნი პაციენტის მონაცემები და მისთვის დასკანერებული ფაილები ფორმაში არ უნდა დარჩეს.
    // ახალი პაციენტისას (ნომერი შეასწორეს) ხელით შეყვანილი მონაცემები რჩება.
    if (lookup === "found") {
      releasePending(pending);
      setPending([]);
      setValues({ ...EMPTY_PATIENT, personalId });
    } else {
      setValues((v) => ({ ...v, personalId }));
    }
    setRecord(null);
    setLookup("idle");
    setErrors({});

    if (personalId.length === 11) search(personalId);
  }

  function blurPersonalId() {
    const { personalId } = values;
    if (!personalId) return;
    if (personalId.length !== 11) setErrors((e) => ({ ...e, personalId: "პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან" }));
    else if (searchedId.current !== personalId) search(personalId);
  }

  function clearError(key: string) {
    if (!errors[key]) return;
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function setField(key: TextField, value: string) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      // ლათინური ველი მიჰყვება ქართულს, სანამ ხელით არ შეცვლილა (ანუ ემთხვევა ძველის ტრანსლიტერაციას)
      const latinKey = TRANSLITERATED[key];
      if (latinKey && (v[latinKey] === "" || v[latinKey] === transliterate(v[key]))) next[latinKey] = transliterate(value);
      return next;
    });
    clearError(key);
  }

  function setChoice(key: "gender" | "maritalStatus", value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    clearError(key);
  }

  function clear() {
    releasePending(pending);
    setPending([]);
    setPolicy(EMPTY_POLICY_DRAFT);
    setValues(EMPTY_PATIENT);
    setRecord(null);
    setLookup("idle");
    setErrors({});
    searchedId.current = "";
    personalIdInput.current?.focus();
  }

  function validatePending(): string | null {
    if (pending.some((d) => !d.title.trim())) return "მიუთითეთ ყველა დოკუმენტის სახელი";
    if (pending.reduce((sum, d) => sum + d.blob.size, 0) > MAX_TOTAL_UPLOAD) return "ფაილების ჯამური ზომა დასაშვებზე დიდია";
    return null;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lookup !== "found" && lookup !== "new") {
      setErrors({ personalId: "შეიყვანეთ პირადი ნომერი (11 ციფრი)" });
      personalIdInput.current?.focus();
      return;
    }

    const updateFields = lookup === "new" || canEdit;
    const fieldErrors = updateFields ? validateFields(values) : {};
    const policyInput = lookup === "new" && insuranceCompanies ? policyDraftInput(policy) : null;
    if (policyInput) {
      const parsedPolicy = newPatientPolicySchema.safeParse(policyInput);
      if (!parsedPolicy.success) Object.assign(fieldErrors, fieldErrorsOf(parsedPolicy.error));
    }
    const docsError = validatePending();
    if (docsError) fieldErrors.documents = docsError;
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      toast.error("შეასწორეთ მონიშნული ველები");
      focusFirstError(fieldErrors);
      return;
    }

    const formData = new FormData();
    if (record) formData.set("patientId", String(record.id));
    if (updateFields) formData.set("patient", JSON.stringify(values));
    if (policyInput) formData.set("policy", JSON.stringify(policyInput));
    formData.set("documents", JSON.stringify(pending.map((d) => ({ docType: d.docType, title: d.title }))));
    for (const d of pending) formData.append("files", d.blob, d.originalName);

    startSaving(async () => {
      let res: PatientSaveResult;
      try {
        res = updateFields ? await savePatient(formData) : await addPatientDocuments(formData);
      } catch {
        toast.error("შენახვა ვერ მოხერხდა. სცადეთ თავიდან");
        return;
      }
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "შენახვა ვერ მოხერხდა");
        if (res.fieldErrors) focusFirstError(res.fieldErrors);
        return;
      }
      toast.success(res.message);
      releasePending(pending);
      setPending([]);
      if (patientHref && !record) {
        // Next.js ნანახ გვერდს მეხსიერებაში ინახავს — „ახალ პაციენტზე“ დაბრუნებისას ფორმა სუფთა უნდა იყოს
        clear();
        startNavigationProgress();
        router.push(`${patientHref}/${res.record.id}`);
        return;
      }
      searchedId.current = res.record.values.personalId;
      showRecord(res.record);
    });
  }

  const text = (key: TextField, extra?: Partial<React.ComponentProps<typeof Input>>) => ({
    id: `patient-${key}`,
    name: key,
    value: values[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField(key, e.target.value),
    disabled: fieldsDisabled,
    readOnly,
    "aria-invalid": errors[key] ? true : undefined,
    className: cn("h-9", readOnly && READ_ONLY_CLASS),
    ...extra,
  });

  const canSave = (lookup === "new" || (lookup === "found" && (canEdit || pending.length > 0))) && !saving;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>პირადი მონაცემები</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              id="patient-personalId"
              label="პირადი ნომერი *"
              error={errors.personalId}
              hint={lookup === "searching" ? "ძებნა..." : "11 ციფრი"}
            >
              <div className="relative">
                <Input
                  ref={personalIdInput}
                  id="patient-personalId"
                  name="personalId"
                  value={values.personalId}
                  onChange={(e) => changePersonalId(e.target.value)}
                  onBlur={blurPersonalId}
                  readOnly={lockPersonalId}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={11}
                  autoFocus={!lockPersonalId && !values.personalId}
                  aria-invalid={errors.personalId ? true : undefined}
                  className={cn("h-9 pr-8 font-mono tracking-wider", lockPersonalId && READ_ONLY_CLASS)}
                />
                {lookup === "searching" && (
                  <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </FormField>
          </div>

          <LookupStatus
            lookup={lookup}
            record={record}
            readOnly={readOnly}
            onPatientPage={lockPersonalId}
            href={patientHref && record && !lockPersonalId ? `${patientHref}/${record.id}` : undefined}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField id="patient-firstName" label="სახელი *" error={errors.firstName}>
              <Input {...text("firstName")} />
            </FormField>
            <FormField id="patient-lastName" label="გვარი *" error={errors.lastName}>
              <Input {...text("lastName")} />
            </FormField>
            <FormField id="patient-fatherName" label="მამის სახელი" error={errors.fatherName}>
              <Input {...text("fatherName")} />
            </FormField>
            <FormField id="patient-firstNameEn" label="First Name *" error={errors.firstNameEn}>
              <Input {...text("firstNameEn", { lang: "en", spellCheck: false })} />
            </FormField>
            <FormField id="patient-lastNameEn" label="Last Name *" error={errors.lastNameEn}>
              <Input {...text("lastNameEn", { lang: "en", spellCheck: false })} />
            </FormField>
            <FormField id="patient-birthDate" label="დაბადების თარიღი *" error={errors.birthDate}>
              <Input {...text("birthDate", { type: "date", min: "1900-01-01" })} />
            </FormField>
            <FormField id="patient-gender" label="სქესი *" error={errors.gender}>
              <ChoiceSelect
                id="patient-gender"
                items={GENDERS}
                value={values.gender}
                onChange={(v) => setChoice("gender", v)}
                disabled={fieldsDisabled}
                readOnly={readOnly}
                invalid={!!errors.gender}
              />
            </FormField>
            <FormField id="patient-maritalStatus" label="ოჯახური მდგომარეობა" error={errors.maritalStatus}>
              <ChoiceSelect
                id="patient-maritalStatus"
                items={MARITAL_STATUSES}
                value={values.maritalStatus}
                onChange={(v) => setChoice("maritalStatus", v)}
                disabled={fieldsDisabled}
                readOnly={readOnly}
                invalid={!!errors.maritalStatus}
                clearable
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>კონტაქტი</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="patient-phone" label="ტელეფონი" error={errors.phone}>
              <Input {...text("phone", { type: "tel", inputMode: "tel" })} />
            </FormField>
            <FormField id="patient-email" label="იმეილი" error={errors.email}>
              <Input {...text("email", { type: "email", spellCheck: false })} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>სამსახური და განათლება</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="patient-workplace" label="სამუშაო ადგილი" error={errors.workplace}>
              <Input {...text("workplace")} />
            </FormField>
            <FormField id="patient-position" label="თანამდებობა" error={errors.position}>
              <Input {...text("position")} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField id="patient-education" label="განათლება" error={errors.education}>
                <Input {...text("education")} />
              </FormField>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>მისამართი</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="patient-country" label="ქვეყანა" error={errors.country}>
            <Input {...text("country")} />
          </FormField>
          <FormField id="patient-city" label="ქალაქი" error={errors.city}>
            <Input {...text("city")} />
          </FormField>
          <FormField id="patient-actualAddress" label="ფაქტიური მისამართი" error={errors.actualAddress}>
            <Input {...text("actualAddress")} />
          </FormField>
          <FormField id="patient-legalAddress" label="იურიდიული მისამართი" error={errors.legalAddress}>
            <Input {...text("legalAddress")} />
          </FormField>
        </CardContent>
      </Card>

      {/* დაზღვევა — მხოლოდ ახალი პაციენტის რეგისტრაციისას; შემდეგ — ბარათის „დაზღვევის“ ჩანართიდან */}
      {insuranceCompanies && lookup === "new" && (
        <Card>
          <CardHeader>
            <CardTitle>დაზღვევა</CardTitle>
          </CardHeader>
          <CardContent>
            <NewPatientPolicy
              value={policy}
              onChange={(next) => {
                setPolicy(next);
                setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => !(key in POLICY_FIELD_IDS))));
              }}
              companies={insuranceCompanies}
              errors={errors}
              disabled={saving}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>დოკუმენტები</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsSection
            stored={record?.documents ?? []}
            pending={pending}
            onPendingChange={setPending}
            onStoredDeleted={(id) =>
              setRecord((r) => (r ? { ...r, documents: r.documents.filter((d) => d.id !== id) } : r))
            }
            enabled={personalIdReady}
            canDeleteStored={canEdit}
            errors={errors}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>კომენტარი</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField id="patient-comment" label="კომენტარი" error={errors.comment}>
            <Textarea
              id="patient-comment"
              name="comment"
              value={values.comment ?? ""}
              onChange={(e) => setField("comment", e.target.value)}
              disabled={fieldsDisabled}
              readOnly={readOnly}
              aria-invalid={errors.comment ? true : undefined}
              className={cn("min-h-24", readOnly && READ_ONLY_CLASS)}
              rows={4}
            />
          </FormField>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        {readOnly && (
          <p className="mr-auto text-xs text-muted-foreground">
            {pending.length ? "შეინახება მხოლოდ ახალი დოკუმენტები" : "მონაცემებს ცვლის მხოლოდ ადმინისტრატორი"}
          </p>
        )}
        {!lockPersonalId && (
          <Button type="button" variant="outline" size="lg" onClick={clear} disabled={saving}>
            <Eraser />
            გასუფთავება
          </Button>
        )}
        <Button type="submit" size="lg" disabled={!canSave}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "ინახება..." : "შენახვა"}
        </Button>
      </div>
    </form>
  );
}

function validateFields(values: PatientFormValues): Record<string, string> {
  const parsed = patientSchema.safeParse(values);
  return parsed.success ? {} : fieldErrorsOf(parsed.error);
}

/** პოლისის ველების id-ები (NewPatientPolicy) — დანარჩენი ველები `patient-<key>`-ია. */
const POLICY_FIELD_IDS: Record<string, string> = {
  policyCompanyId: "policy-company",
  policyNumber: "policy-number",
  policyValidFrom: "policy-from",
  policyValidTo: "policy-to",
};

function focusFirstError(errors: Record<string, string>) {
  const first = Object.keys(errors)[0];
  document.getElementById(POLICY_FIELD_IDS[first] ?? `patient-${first}`)?.focus();
}

function LookupStatus({
  lookup,
  record,
  readOnly,
  onPatientPage,
  href,
}: {
  lookup: Lookup;
  record: PatientRecord | null;
  readOnly: boolean;
  /** პაციენტის საკუთარ გვერდზე „ნაპოვნია“ არ იწერება, მხოლოდ რეგისტრაციის ინფორმაცია */
  onPatientPage: boolean;
  /** პაციენტის სრული ინფორმაციის გვერდი (რეგისტრაციის ფორმაში უკვე არსებულ ნომერზე) */
  href?: string;
}) {
  if (lookup === "found" && record) {
    return (
      <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        {readOnly ? <Lock /> : <CircleCheck />}
        <AlertTitle>{onPatientPage ? "რეგისტრაციის ინფორმაცია" : "პაციენტი ნაპოვნია"}</AlertTitle>
        <AlertDescription className="text-emerald-800 dark:text-emerald-200">
          დარეგისტრირდა: {record.createdAt}
          {record.createdBy && ` (${record.createdBy})`}
          {record.updatedAt !== record.createdAt && ` · ბოლოს შეიცვალა: ${record.updatedAt}${record.updatedBy ? ` (${record.updatedBy})` : ""}`}
          {readOnly && <span className="block">მონაცემებს ცვლის მხოლოდ ადმინისტრატორი; შეგიძლიათ დაამატოთ დოკუმენტები.</span>}
          {href && (
            <Link href={href} className="mt-1 block font-medium">
              პაციენტის სრული ინფორმაცია →
            </Link>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (lookup === "new") {
    return (
      <Alert className="border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <UserPlus />
        <AlertTitle>ახალი პაციენტი</AlertTitle>
        <AlertDescription className="text-sky-800 dark:text-sky-200">ამ პირადი ნომრით პაციენტი არ არის. შეავსეთ მონაცემები.</AlertDescription>
      </Alert>
    );
  }
  return null;
}

function ChoiceSelect({
  id,
  items,
  value,
  onChange,
  disabled,
  readOnly,
  invalid,
  clearable,
}: {
  id: string;
  items: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  readOnly: boolean;
  invalid: boolean;
  clearable?: boolean;
}) {
  // value: null = არჩეული არ არის
  const options: { value: string | null; label: string }[] = clearable
    ? [{ value: null, label: "— არ არის მითითებული —" }, ...items]
    : [...items];
  return (
    <Select
      items={options}
      value={value || null}
      onValueChange={(v) => onChange((v as string | null) ?? "")}
      disabled={disabled}
      readOnly={readOnly}
    >
      <SelectTrigger id={id} className={cn("h-9 w-full", readOnly && READ_ONLY_CLASS)} aria-invalid={invalid || undefined}>
        <SelectValue placeholder="აირჩიეთ" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value ?? "none"} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
