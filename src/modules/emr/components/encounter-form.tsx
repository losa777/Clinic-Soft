"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CircleCheck, CloudOff, FileStack, Loader2, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createTemplateAction, deleteTemplateAction, saveEncounterDraftAction } from "@/modules/emr/actions/visit-form-actions";
import { TEXT_FIELDS, type TemplateFieldCode, type TextFieldKey } from "@/modules/emr/schema";
import type { DoctorTemplateRow, EncounterFormData } from "@/modules/emr/server/encounter";
import { BMI_LABELS, bmi, checkVital, parseVital, VITAL_KEYS, VITALS, type VitalKey, vitalFlag } from "@/modules/emr/vitals";
import type { CompletionPreview } from "@/modules/emr/server/completion";
import { CompleteVisit } from "./complete-visit";
import { Icd10Picker } from "./icd10-picker";

/** აკრეფის შეწყვეტიდან ამდენ ხანში ინახება (ავტოშენახვა). */
const AUTOSAVE_MS = 2500;

type Diagnosis = { code: string; name: string; primary: boolean };
type SaveState = { kind: "saved"; at: string } | { kind: "dirty" } | { kind: "saving" } | { kind: "invalid" } | { kind: "error"; message: string } | { kind: "conflict"; message: string };

const toRaw = (v: number | null) => (v === null ? "" : String(v));

/**
 * ვიზიტის (გასინჯვის) ფორმა: ჩივილები, ანამნეზი, ვიტალური (BMI, ნორმიდან გადახრა), გასინჯვა, დიაგნოზები (ICD-10),
 * გეგმა, რეკომენდაციები. ავტოშენახვა აკრეფის შეწყვეტიდან რამდენიმე წამში; შაბლონები ველების მიხედვით.
 * data.editable = false — მხოლოდ სანახავად (სხვა ექიმის ან დასრულებული ვიზიტი).
 */
export function EncounterForm({
  data,
  templates: initialTemplates,
  completion,
}: {
  data: EncounterFormData;
  templates: DoctorTemplateRow[];
  /** ვიზიტის დასრულების ბილინგი (მხოლოდ საკუთარ, დაუსრულებელ ვიზიტზე) */
  completion?: CompletionPreview | null;
}) {
  const [texts, setTexts] = useState<Record<TextFieldKey, string>>(data.texts);
  const [vitals, setVitals] = useState<Record<VitalKey, string>>(
    () => Object.fromEntries(VITAL_KEYS.map((k) => [k, toRaw(data.vitals[k])])) as Record<VitalKey, string>,
  );
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(data.diagnoses);
  const [templates, setTemplates] = useState(initialTemplates);
  const [state, setState] = useState<SaveState>({ kind: "saved", at: data.savedAt });
  const [changes, setChanges] = useState(0);
  const version = useRef(data.version);
  const saving = useRef(false);
  // ბოლო მნიშვნელობები შენახვისთვის (ტაიმერი ძველ closure-ს არ იყენებს) და ცვლილებების მრიცხველი:
  // შენახვის დროს თუ ისევ შეიცვალა, სტატუსი „შეუნახავი“ რჩება და ტაიმერი ხელახლა შეინახავს
  const latest = useRef({ texts, vitals, diagnoses });
  const changeSeq = useRef(0);
  // ბოლო წარმატებით შენახული ცვლილების ნომერი (დასრულებამდე flush-ისთვის)
  const savedSeq = useRef(0);
  useEffect(() => {
    latest.current = { texts, vitals, diagnoses };
  }, [texts, vitals, diagnoses]);

  const parsed = Object.fromEntries(VITAL_KEYS.map((k) => [k, parseVital(vitals[k])])) as Record<VitalKey, number | null>;
  const vitalErrors = Object.fromEntries(VITAL_KEYS.map((k) => [k, checkVital(k, parsed[k])])) as Record<VitalKey, string | null>;
  const hasErrors = VITAL_KEYS.some((k) => vitalErrors[k]);
  const bmiValue = bmi(parsed.weightKg, parsed.heightCm);

  const save = useCallback(async () => {
    if (saving.current) return;
    const { texts: t, vitals: v, diagnoses: d } = latest.current;
    const values = Object.fromEntries(VITAL_KEYS.map((k) => [k, parseVital(v[k])])) as Record<VitalKey, number | null>;
    if (VITAL_KEYS.some((k) => checkVital(k, values[k]))) {
      setState({ kind: "invalid" });
      return;
    }
    saving.current = true;
    setState({ kind: "saving" });
    const sentSeq = changeSeq.current;
    try {
      const res = await saveEncounterDraftAction({
        encounterId: data.id,
        version: version.current,
        ...t,
        ...values,
        diagnoses: d.map((x) => ({ code: x.code, primary: x.primary })),
      });
      if (res.ok) {
        version.current = res.version;
        savedSeq.current = sentSeq;
        if (changeSeq.current === sentSeq) setState({ kind: "saved", at: res.savedAt });
        else {
          // შენახვისას კიდევ შეიცვალა (ტაიმერი შეიძლება ამ დროს გამოტოვდა) — ტაიმერი თავიდან
          setState({ kind: "dirty" });
          setChanges((n) => n + 1);
        }
      } else if (res.conflict) setState({ kind: "conflict", message: res.error ?? "კონფლიქტი" });
      else setState({ kind: "error", message: res.error ?? "შენახვა ვერ მოხერხდა" });
    } catch {
      setState({ kind: "error", message: "კავშირის შეცდომა — ცვლილებები ჯერ არ შეინახა" });
    } finally {
      saving.current = false;
    }
  }, [data.id]);

  /** ყველა ცვლილების შენახვა ახლავე (ვიზიტის დასრულებამდე): true — ყველაფერი შენახულია. */
  const flush = useCallback(async () => {
    for (let i = 0; i < 3; i++) {
      while (saving.current) await new Promise((r) => setTimeout(r, 100));
      if (savedSeq.current === changeSeq.current) return true;
      await save();
    }
    while (saving.current) await new Promise((r) => setTimeout(r, 100));
    return savedSeq.current === changeSeq.current;
  }, [save]);

  // ავტოშენახვა: ბოლო ცვლილებიდან AUTOSAVE_MS-ში
  useEffect(() => {
    if (!changes || !data.editable) return;
    const timer = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [changes, data.editable, save]);

  // შეუნახავი ცვლილებებით გვერდიდან გასვლისას — გაფრთხილება
  const unsaved = state.kind === "dirty" || state.kind === "saving" || state.kind === "invalid" || state.kind === "error";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function changed() {
    changeSeq.current++;
    setChanges((n) => n + 1);
    setState((s) => (s.kind === "conflict" ? s : { kind: "dirty" }));
  }
  const setText = (key: TextFieldKey, value: string) => {
    setTexts((t) => ({ ...t, [key]: value }));
    changed();
  };
  const setDx = (next: Diagnosis[]) => {
    setDiagnoses(next);
    changed();
  };

  const editable = data.editable && state.kind !== "conflict";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {data.doctor} · დაიწყო {data.startedAt}
        </span>
        {data.status === "completed" && <Badge variant="outline">დასრულებული — ჩაკეტილია</Badge>}
        {!data.editable && data.status === "draft" && <Badge variant="secondary">სხვა ექიმის ვიზიტი — მხოლოდ სანახავად</Badge>}
        {data.editable && <SaveIndicator state={state} onSave={save} hasErrors={hasErrors} />}
      </div>
      {state.kind === "conflict" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ვიტალური მაჩვენებლები</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VITAL_KEYS.map((k) => (
            <VitalInput
              key={k}
              k={k}
              raw={vitals[k]}
              value={parsed[k]}
              error={vitalErrors[k]}
              disabled={!editable}
              onChange={(raw) => {
                setVitals((v) => ({ ...v, [k]: raw }));
                changed();
              }}
            />
          ))}
          <div className="col-span-2 flex items-end gap-2 rounded-lg bg-muted/40 px-3 py-2 sm:col-span-4">
            <span className="text-sm text-muted-foreground">BMI:</span>
            {bmiValue ? (
              <>
                <b className="text-lg tabular-nums">{bmiValue.value}</b>
                <Badge variant={bmiValue.category === "normal" ? "secondary" : "destructive"}>{BMI_LABELS[bmiValue.category]}</Badge>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">წონა და სიმაღლე → ავტომატურად</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>გასინჯვა</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {TEXT_FIELDS.filter((f) => f.key !== "treatmentPlan" && f.key !== "recommendations").map((f) => (
            <TextBlock
              key={f.key}
              field={f}
              value={texts[f.key]}
              editable={editable}
              templates={templates.filter((t) => t.field === f.template)}
              onChange={(v) => setText(f.key, v)}
              onTemplatesChange={setTemplates}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>დიაგნოზი (ICD-10)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {editable && (
            <Icd10Picker
              id="diagnosis-search"
              onSelect={(o) => {
                if (diagnoses.some((d) => d.code === o.code)) return toast.info(`${o.code} უკვე დამატებულია`);
                // პირველი დიაგნოზი — ძირითადი
                setDx([...diagnoses, { code: o.code, name: o.nameKa, primary: !diagnoses.some((d) => d.primary) }]);
              }}
            />
          )}
          {diagnoses.length === 0 ? (
            <p className="text-sm text-muted-foreground">დიაგნოზი ჯერ არ არის (ვიზიტის დასრულებისთვის სავალდებულოა)</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {diagnoses.map((d) => (
                <li key={d.code} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 text-sm", d.primary && "border-primary bg-primary/5")}>
                  <span className="w-14 shrink-0 font-mono font-medium">{d.code}</span>
                  <span className="flex-1">{d.name}</span>
                  {editable ? (
                    <>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="radio"
                          name="primary-diagnosis"
                          checked={d.primary}
                          onChange={() => setDx(diagnoses.map((x) => ({ ...x, primary: x.code === d.code })))}
                        />
                        ძირითადი
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const rest = diagnoses.filter((x) => x.code !== d.code);
                          // ძირითადი წაიშალა — ძირითადი ხდება პირველი დარჩენილი
                          if (d.primary && rest.length) rest[0] = { ...rest[0], primary: true };
                          setDx(rest);
                        }}
                        className="rounded-sm text-muted-foreground hover:text-destructive"
                        aria-label={`${d.code} — წაშლა`}
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{d.primary ? "ძირითადი" : "თანმხლები"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>მკურნალობა</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {TEXT_FIELDS.filter((f) => f.key === "treatmentPlan" || f.key === "recommendations").map((f) => (
            <TextBlock
              key={f.key}
              field={f}
              value={texts[f.key]}
              editable={editable}
              templates={templates.filter((t) => t.field === f.template)}
              onChange={(v) => setText(f.key, v)}
              onTemplatesChange={setTemplates}
            />
          ))}
        </CardContent>
      </Card>

      {editable && completion && (
        <CompleteVisit
          encounterId={data.id}
          preview={completion}
          hasPrimaryDiagnosis={diagnoses.some((d) => d.primary)}
          blocked={hasErrors ? "შეასწორეთ ვიტალური მაჩვენებლები" : null}
          flush={flush}
          getVersion={() => version.current}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state, onSave, hasErrors }: { state: SaveState; onSave: () => void; hasErrors: boolean }) {
  const view = {
    saved: { icon: <CircleCheck className="size-4 text-emerald-600" />, text: state.kind === "saved" ? `შენახულია ${state.at}` : "" },
    dirty: { icon: <Save className="size-4 text-muted-foreground" />, text: "შეუნახავი ცვლილებები" },
    saving: { icon: <Loader2 className="size-4 animate-spin" />, text: "ინახება..." },
    invalid: { icon: <CloudOff className="size-4 text-destructive" />, text: "შეასწორეთ მონიშნული მნიშვნელობები — შენახვა შეჩერებულია" },
    error: { icon: <CloudOff className="size-4 text-destructive" />, text: state.kind === "error" ? state.message : "" },
    conflict: { icon: <CloudOff className="size-4 text-destructive" />, text: "კონფლიქტი" },
  }[state.kind];
  return (
    <span className="ml-auto flex items-center gap-2" role="status" aria-live="polite">
      {view.icon}
      <span className={cn(state.kind === "error" || state.kind === "invalid" ? "text-destructive" : "text-muted-foreground")}>{view.text}</span>
      {(state.kind === "dirty" || state.kind === "error") && !hasErrors && (
        <Button size="sm" variant="outline" onClick={onSave}>
          <Save />
          შენახვა
        </Button>
      )}
    </span>
  );
}

function VitalInput({
  k,
  raw,
  value,
  error,
  disabled,
  onChange,
}: {
  k: VitalKey;
  raw: string;
  value: number | null;
  error: string | null;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  const spec = VITALS[k];
  const flag = error ? null : vitalFlag(k, value);
  return (
    <FormField id={`vital-${k}`} label={`${spec.label} (${spec.unit})`} error={error ?? undefined}>
      <div className="relative">
        <Input
          id={`vital-${k}`}
          value={raw}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-10 pr-9 tabular-nums",
            flag === "high" && "border-destructive text-destructive",
            flag === "low" && "border-sky-500 text-sky-700 dark:text-sky-300",
          )}
        />
        {flag === "high" && <ArrowUp className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-destructive" aria-label="ნორმაზე მაღალი" />}
        {flag === "low" && <ArrowDown className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-sky-600" aria-label="ნორმაზე დაბალი" />}
      </div>
    </FormField>
  );
}

function TextBlock({
  field,
  value,
  editable,
  templates,
  onChange,
  onTemplatesChange,
}: {
  field: (typeof TEXT_FIELDS)[number];
  value: string;
  editable: boolean;
  templates: DoctorTemplateRow[];
  onChange: (value: string) => void;
  onTemplatesChange: (update: (all: DoctorTemplateRow[]) => DoctorTemplateRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = `encounter-${field.key}`;
  if (!editable) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{field.label}</p>
        <p className="min-h-6 text-sm whitespace-pre-line text-muted-foreground">{value || "—"}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {field.label}
        </label>
        <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={() => setOpen(true)}>
          <FileStack />
          შაბლონები{templates.length ? ` (${templates.length})` : ""}
        </Button>
      </div>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={10_000} className="min-h-20" />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <TemplatesDialog
            field={field}
            current={value}
            templates={templates}
            onInsert={(content) => {
              onChange(value.trim() ? `${value.trimEnd()}\n${content}` : content);
              setOpen(false);
            }}
            onTemplatesChange={onTemplatesChange}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ველის შაბლონები: ჩასმა ერთი კლიკით, მიმდინარე ტექსტის შენახვა შაბლონად, წაშლა. */
function TemplatesDialog({
  field,
  current,
  templates,
  onInsert,
  onTemplatesChange,
}: {
  field: (typeof TEXT_FIELDS)[number];
  current: string;
  templates: DoctorTemplateRow[];
  onInsert: (content: string) => void;
  onTemplatesChange: (update: (all: DoctorTemplateRow[]) => DoctorTemplateRow[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function saveCurrent() {
    startTransition(async () => {
      const res = await createTemplateAction({ field: field.template as TemplateFieldCode, title, content: current });
      if (!res.ok) return void toast.error(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
      toast.success(res.message);
      setTitle("");
      onTemplatesChange((all) => [...all, res.template as DoctorTemplateRow]);
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await deleteTemplateAction(id);
      if (!res.ok) return void toast.error(res.error);
      onTemplatesChange((all) => all.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>შაბლონები — {field.label}</DialogTitle>
        <DialogDescription>დააჭირეთ შაბლონს — ტექსტი ველს დაემატება.</DialogDescription>
      </DialogHeader>
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">ამ ველისთვის შაბლონი ჯერ არ გაქვთ.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {templates.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <button type="button" onClick={() => onInsert(t.content)} className="min-w-0 flex-1 text-left hover:text-primary">
                <span className="font-medium">{t.title}</span>
                <span className="line-clamp-2 block text-xs text-muted-foreground">{t.content}</span>
              </button>
              <button type="button" onClick={() => remove(t.id)} disabled={pending} className="text-muted-foreground hover:text-destructive" aria-label="შაბლონის წაშლა">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-sm font-medium">მიმდინარე ტექსტის შენახვა შაბლონად</p>
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="შაბლონის სახელი" maxLength={100} className="h-9" />
          <Button type="button" onClick={saveCurrent} disabled={pending || !current.trim() || !title.trim()}>
            შენახვა
          </Button>
        </div>
        {!current.trim() && <p className="text-xs text-muted-foreground">ველი ცარიელია — ჯერ შეიყვანეთ ტექსტი.</p>}
      </div>
      <DialogFooter />
    </div>
  );
}
