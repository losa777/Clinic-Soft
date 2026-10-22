"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveSettingsAction } from "@/modules/finance/actions/settings-actions";
import { type ClinicSettings, SETTING_KEYS, SETTING_LABELS } from "@/modules/finance/settings";

/** კლინიკის რეკვიზიტები — ქვითრის თავსა და ბოლოში ჩანს. */
export function SettingsForm({ initial }: { initial: ClinicSettings }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveSettingsAction(values);
              setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
              if (res.ok) toast.success(res.message);
              else toast.error(res.error);
            });
          }}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          {SETTING_KEYS.map((key) => (
            <FormField key={key} id={`setting-${key}`} label={SETTING_LABELS[key]} error={errors[key]}>
              <Input
                id={`setting-${key}`}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                maxLength={500}
                className="h-10"
              />
            </FormField>
          ))}
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={pending}>
              <Save />
              {pending ? "ინახება..." : "შენახვა"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
