"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { addPolicyAction, deactivatePolicyAction } from "@/modules/finance/actions/insurance-actions";
import { NativeSelectClient } from "./native-select";

export type PolicyRow = {
  id: number;
  company: string;
  policyNumber: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  /** დღეს მოქმედებს (აქტიური და თარიღებში) */
  isCurrent: boolean;
};

/** პაციენტის სადაზღვევო პოლისები: სია, დამატება, გათიშვა (canEdit — invoices.create ან insurance.manage). */
export function PatientPolicies({
  patientId,
  policies,
  companies,
  canEdit,
  today,
}: {
  patientId: number;
  policies: PolicyRow[];
  companies: { id: number; name: string }[];
  canEdit: boolean;
  today: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [validFrom, setValidFrom] = useState(today);
  const [validTo, setValidTo] = useState("");
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = failure?.fieldErrors ?? {};

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>სადაზღვევო პოლისები</CardTitle>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!companies.length}>
            <Plus />
            პოლისის დამატება
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => addPolicyAction({ patientId, companyId: Number(companyId) || 0, policyNumber, validFrom, validTo }),
                () => {
                  setAdding(false);
                  setPolicyNumber("");
                  setValidTo("");
                },
              );
            }}
            className="grid gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
            noValidate
          >
            <FormField id="policy-company" label="კომპანია *" error={errors.companyId}>
              <NativeSelectClient
                id="policy-company"
                value={companyId}
                onChange={setCompanyId}
                options={[{ value: "", label: "აირჩიეთ" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
              />
            </FormField>
            <FormField id="policy-number" label="პოლისის ნომერი *" error={errors.policyNumber}>
              <Input id="policy-number" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} maxLength={50} className="h-9" />
            </FormField>
            <FormField id="policy-from" label="მოქმედებს-დან *" error={errors.validFrom}>
              <Input id="policy-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="h-9" />
            </FormField>
            <FormField id="policy-to" label="მოქმედებს-მდე *" error={errors.validTo}>
              <Input id="policy-to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="h-9" />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "ინახება..." : "დამატება"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={pending}>
                გაუქმება
              </Button>
            </div>
          </form>
        )}
        {failure && !failure.fieldErrors && (
          <Alert variant="destructive">
            <AlertDescription>{failure.error}</AlertDescription>
          </Alert>
        )}
        {policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">პოლისი არ არის — ინვოისის მთელ თანხას პაციენტი იხდის.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {policies.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                {p.isCurrent ? <ShieldCheck className="size-4 text-emerald-600" /> : <ShieldOff className="size-4 text-muted-foreground" />}
                <span className="font-medium">{p.company}</span>
                <span className="font-mono">{p.policyNumber}</span>
                <span className="text-muted-foreground tabular-nums">
                  {p.validFrom} — {p.validTo}
                </span>
                {p.isCurrent ? (
                  <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">მოქმედი</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {p.isActive ? "ვადა არ ემთხვევა" : "გათიშული"}
                  </Badge>
                )}
                {canEdit && p.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => run(() => deactivatePolicyAction(p.id))}
                    disabled={pending}
                  >
                    გათიშვა
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
