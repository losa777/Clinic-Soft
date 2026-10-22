"use client";

import { ShieldCheck } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { addDays, tbilisiToday } from "@/lib/appointment-slots";
import type { PolicyDraft } from "@/modules/finance/schema";
import { NativeSelectClient } from "./native-select";

/**
 * ახალი პაციენტის რეგისტრაციისას: „პაციენტი დაზღვეულია“ + პოლისის ველები (კომპანია, ნომერი, ვადა).
 * არასავალდებულოა; შეცდომების გასაღებები: policyCompanyId, policyNumber, policyValidFrom, policyValidTo.
 */
export function NewPatientPolicy({
  value,
  onChange,
  companies,
  errors,
  disabled,
}: {
  value: PolicyDraft;
  onChange: (value: PolicyDraft) => void;
  companies: { id: number; name: string }[];
  errors: Record<string, string | undefined>;
  disabled?: boolean;
}) {
  const set = (patch: Partial<PolicyDraft>) => onChange({ ...value, ...patch });

  function toggle(enabled: boolean) {
    // ჩართვისას: ერთადერთი კომპანია და ვადა „დღეიდან ერთი წელი“ — ნაგულისხმევად
    if (enabled && !value.validFrom) {
      const today = tbilisiToday();
      set({
        enabled,
        validFrom: today,
        validTo: addDays(addDays(today, 365), -1),
        companyId: value.companyId || (companies.length === 1 ? String(companies[0].id) : ""),
      });
    } else set({ enabled });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Switch checked={value.enabled} onCheckedChange={toggle} disabled={disabled || !companies.length} />
        <ShieldCheck className="size-4 text-muted-foreground" />
        პაციენტი დაზღვეულია
        {!companies.length && <span className="font-normal text-muted-foreground">— სადაზღვევო კომპანია ჯერ არ არის დამატებული</span>}
      </label>
      {value.enabled && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField id="policy-company" label="სადაზღვევო კომპანია *" error={errors.policyCompanyId}>
            <NativeSelectClient
              id="policy-company"
              value={value.companyId}
              onChange={(companyId) => set({ companyId })}
              options={[{ value: "", label: "აირჩიეთ" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
              invalid={!!errors.policyCompanyId}
              className="h-9"
            />
          </FormField>
          <FormField id="policy-number" label="პოლისის ნომერი *" error={errors.policyNumber}>
            <Input
              id="policy-number"
              value={value.policyNumber}
              onChange={(e) => set({ policyNumber: e.target.value })}
              maxLength={50}
              aria-invalid={errors.policyNumber ? true : undefined}
              className="h-9"
            />
          </FormField>
          <FormField id="policy-from" label="მოქმედებს-დან *" error={errors.policyValidFrom}>
            <Input
              id="policy-from"
              type="date"
              value={value.validFrom}
              onChange={(e) => set({ validFrom: e.target.value })}
              aria-invalid={errors.policyValidFrom ? true : undefined}
              className="h-9"
            />
          </FormField>
          <FormField id="policy-to" label="მოქმედებს-მდე *" error={errors.policyValidTo}>
            <Input
              id="policy-to"
              type="date"
              value={value.validTo}
              onChange={(e) => set({ validTo: e.target.value })}
              aria-invalid={errors.policyValidTo ? true : undefined}
              className="h-9"
            />
          </FormField>
        </div>
      )}
    </div>
  );
}
