"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { createRole, updateRole } from "./actions";
import type { RoleRow } from "./roles-table";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; role: RoleRow | null };

export function RoleDialog({ open, onOpenChange, role }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? "როლის რედაქტირება" : "ახალი როლი"}</DialogTitle>
          <DialogDescription>
            {role ? "როლის კოდი შექმნის შემდეგ არ იცვლება" : "კოდი გამოიყენება გვერდის მისამართში, მაგ. /surgeon"}
          </DialogDescription>
        </DialogHeader>
        <RoleForm key={role?.id ?? "new"} role={role} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RoleForm({ role, onDone }: { role: RoleRow | null; onDone: () => void }) {
  const [code, setCode] = useState(role?.code ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = role ? await updateRole({ id: role.id, name }) : await createRole({ code, name });
      setResult(res);
      if (res.ok) {
        toast.success(res.message);
        onDone();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {result && !result.ok && result.error && !result.fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      <FormField id="role-name" label="სახელი (ქართულად)" error={errors.name}>
        <Input
          id="role-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          className="h-10"
          autoFocus
        />
      </FormField>

      <FormField
        id="role-code"
        label="კოდი (ლათინურად)"
        error={errors.code}
        hint={role ? undefined : "ლათინური პატარა ასოები, ციფრები და ტირე"}
      >
        <Input
          id="role-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toLowerCase())}
          disabled={!!role}
          aria-invalid={errors.code ? true : undefined}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="h-10 font-mono"
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : role ? "შენახვა" : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}
