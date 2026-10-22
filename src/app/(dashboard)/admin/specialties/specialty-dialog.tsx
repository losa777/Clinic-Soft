"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { createSpecialty, updateSpecialty } from "./actions";
import type { SpecialtyRow } from "./specialties-table";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; specialty: SpecialtyRow | null };

export function SpecialtyDialog({ open, onOpenChange, specialty }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{specialty ? "სპეციალობის რედაქტირება" : "ახალი სპეციალობა"}</DialogTitle>
          <DialogDescription>{specialty ? specialty.name : "შეიყვანეთ სპეციალობის დასახელება, მაგ. კარდიოლოგი"}</DialogDescription>
        </DialogHeader>
        <SpecialtyForm key={specialty?.id ?? "new"} specialty={specialty} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SpecialtyForm({ specialty, onDone }: { specialty: SpecialtyRow | null; onDone: () => void }) {
  const [name, setName] = useState(specialty?.name ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = specialty ? await updateSpecialty({ id: specialty.id, name }) : await createSpecialty({ name });
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

      <FormField id="specialty-name" label="დასახელება" error={errors.name}>
        <Input
          id="specialty-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-invalid={errors.name ? true : undefined}
          className="h-10"
          autoFocus
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : specialty ? "შენახვა" : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}
