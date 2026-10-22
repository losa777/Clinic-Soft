"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill, Plus, Stethoscope, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  addAllergyAction,
  addConditionAction,
  addMedicationAction,
  deactivateProfileItemAction,
  setBloodGroupAction,
} from "@/modules/emr/actions/profile-actions";
import { ALLERGY_SEVERITIES, allergySeverityLabel, BLOOD_GROUPS, type BloodGroupInput } from "@/modules/emr/schema";
import type { PatientCard } from "@/modules/emr/server/patient-card";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import { Icd10Picker } from "./icd10-picker";

type PatientCardData = NonNullable<PatientCard>;
type Kind = "allergy" | "condition" | "medication";

function useAction() {
  const router = useRouter();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setFailure(res);
          if (!res.fieldErrors) toast.error(res.error);
          return;
        }
        setFailure(null);
        toast.success(res.message);
        onSuccess?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }
  return { run, pending, errors: failure?.fieldErrors ?? {} };
}

/** სამედიცინო პროფილი: ალერგიები, ქრონიკული დაავადებები, მუდმივი მედიკამენტები, სისხლის ჯგუფი (canEdit — emr.edit). */
export function MedicalProfile({ card, canEdit }: { card: PatientCardData; canEdit: boolean }) {
  const [adding, setAdding] = useState<Kind | null>(null);
  const { run, pending } = useAction();
  const remove = (kind: Kind, id: number) => run(() => deactivateProfileItemAction({ kind, id }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle>სამედიცინო პროფილი</CardTitle>
        <BloodGroup patientId={card.id} value={card.bloodGroup} canEdit={canEdit} />
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        <Section
          title="ალერგიები"
          icon={<TriangleAlert className="size-4 text-destructive" />}
          empty="ალერგია არ არის ჩაწერილი"
          canEdit={canEdit}
          onAdd={() => setAdding("allergy")}
          form={adding === "allergy" && <AllergyForm patientId={card.id} onDone={() => setAdding(null)} />}
          items={card.allergies.map((a) => ({
            id: a.id,
            title: a.substance,
            detail: [allergySeverityLabel(a.severity), a.reaction].filter(Boolean).join(" · "),
            danger: true,
          }))}
          onRemove={(id) => remove("allergy", id)}
          pending={pending}
        />
        <Section
          title="ქრონიკული დაავადებები"
          icon={<Stethoscope className="size-4 text-muted-foreground" />}
          empty="არ არის"
          canEdit={canEdit}
          onAdd={() => setAdding("condition")}
          form={adding === "condition" && <ConditionForm patientId={card.id} onDone={() => setAdding(null)} />}
          items={card.conditions.map((c) => ({
            id: c.id,
            title: c.icd10Code ? `${c.icd10Code} — ${c.name}` : c.name,
            detail: [c.since && `${c.since}-დან`, c.note].filter(Boolean).join(" · "),
          }))}
          onRemove={(id) => remove("condition", id)}
          pending={pending}
        />
        <Section
          title="მუდმივი მედიკამენტები"
          icon={<Pill className="size-4 text-muted-foreground" />}
          empty="არ არის"
          canEdit={canEdit}
          onAdd={() => setAdding("medication")}
          form={adding === "medication" && <MedicationForm patientId={card.id} onDone={() => setAdding(null)} />}
          items={card.medications.map((m) => ({
            id: m.id,
            title: m.drugName,
            detail: [m.dose, m.frequency, m.note].filter(Boolean).join(" · "),
          }))}
          onRemove={(id) => remove("medication", id)}
          pending={pending}
        />
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  icon,
  empty,
  items,
  canEdit,
  onAdd,
  onRemove,
  form,
  pending,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  items: { id: number; title: string; detail: string; danger?: boolean }[];
  canEdit: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  form: React.ReactNode;
  pending: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
        {canEdit && !form && (
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onAdd} aria-label={`${title}: დამატება`} title="დამატება">
            <Plus />
          </Button>
        )}
      </div>
      {form}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((i) => (
            <li
              key={i.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm",
                i.danger && "border-destructive/40 bg-destructive/5",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", i.danger && "text-destructive")}>{i.title}</p>
                {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onRemove(i.id)}
                  disabled={pending}
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  aria-label="მოხსნა"
                  title="მოხსნა (ისტორიაში რჩება)"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FormShell({ children, onSubmit, onCancel, pending }: { children: React.ReactNode; onSubmit: () => void; onCancel: () => void; pending: boolean }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-2 rounded-lg border border-dashed p-2.5"
      noValidate
    >
      {children}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "ინახება..." : "დამატება"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          გაუქმება
        </Button>
      </div>
    </form>
  );
}

function AllergyForm({ patientId, onDone }: { patientId: number; onDone: () => void }) {
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("moderate");
  const { run, pending, errors } = useAction();
  return (
    <FormShell pending={pending} onCancel={onDone} onSubmit={() => run(() => addAllergyAction({ patientId, substance, reaction, severity }), onDone)}>
      <FormField id="allergy-substance" label="ნივთიერება / მედიკამენტი *" error={errors.substance}>
        <Input id="allergy-substance" value={substance} onChange={(e) => setSubstance(e.target.value)} placeholder="მაგ. პენიცილინი" className="h-9" autoFocus />
      </FormField>
      <FormField id="allergy-reaction" label="რეაქცია" error={errors.reaction}>
        <Input id="allergy-reaction" value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder="მაგ. გამონაყარი" className="h-9" />
      </FormField>
      <SegmentedChoice id="allergy-severity" items={ALLERGY_SEVERITIES} value={severity} onChange={setSeverity} />
    </FormShell>
  );
}

function ConditionForm({ patientId, onDone }: { patientId: number; onDone: () => void }) {
  const [icd, setIcd] = useState<{ code: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [since, setSince] = useState("");
  const { run, pending, errors } = useAction();
  return (
    <FormShell
      pending={pending}
      onCancel={onDone}
      onSubmit={() => run(() => addConditionAction({ patientId, icd10Code: icd?.code ?? null, name, since, note: "" }), onDone)}
    >
      <FormField id="condition-icd" label="ICD-10" error={errors.icd10Code}>
        {icd ? (
          <p className="flex items-center gap-2 text-sm">
            <span className="font-mono">{icd.code}</span>
            <Button type="button" size="xs" variant="ghost" onClick={() => setIcd(null)}>
              შეცვლა
            </Button>
          </p>
        ) : (
          <Icd10Picker
            id="condition-icd"
            onSelect={(o) => {
              setIcd({ code: o.code, name: o.nameKa });
              if (!name) setName(o.nameKa);
            }}
          />
        )}
      </FormField>
      <FormField id="condition-name" label="დაავადება *" error={errors.name}>
        <Input id="condition-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </FormField>
      <FormField id="condition-since" label="როდიდან" error={errors.since}>
        <Input id="condition-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} className="h-9" />
      </FormField>
    </FormShell>
  );
}

function MedicationForm({ patientId, onDone }: { patientId: number; onDone: () => void }) {
  const [drugName, setDrugName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const { run, pending, errors } = useAction();
  return (
    <FormShell
      pending={pending}
      onCancel={onDone}
      onSubmit={() => run(() => addMedicationAction({ patientId, drugName, dose, frequency, note: "" }), onDone)}
    >
      <FormField id="medication-name" label="მედიკამენტი *" error={errors.drugName}>
        <Input id="medication-name" value={drugName} onChange={(e) => setDrugName(e.target.value)} className="h-9" autoFocus />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField id="medication-dose" label="დოზა" error={errors.dose}>
          <Input id="medication-dose" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="5 მგ" className="h-9" />
        </FormField>
        <FormField id="medication-frequency" label="სიხშირე" error={errors.frequency}>
          <Input id="medication-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="დღეში 1-ჯერ" className="h-9" />
        </FormField>
      </div>
    </FormShell>
  );
}

function BloodGroup({ patientId, value, canEdit }: { patientId: number; value: string | null; canEdit: boolean }) {
  const { run, pending } = useAction();
  if (!canEdit) {
    return <span className="text-sm text-muted-foreground">სისხლის ჯგუფი: <b className="text-foreground">{value ?? "—"}</b></span>;
  }
  return (
    <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
      სისხლის ჯგუფი:
      <NativeSelectClient
        id="blood-group"
        value={value ?? ""}
        onChange={(bloodGroup) => run(() => setBloodGroupAction({ patientId, bloodGroup: bloodGroup as BloodGroupInput["bloodGroup"] }))}
        options={[{ value: "", label: "—" }, ...BLOOD_GROUPS.map((g) => ({ value: g, label: g }))]}
        className={cn("h-8 w-20", pending && "opacity-50")}
      />
    </label>
  );
}
