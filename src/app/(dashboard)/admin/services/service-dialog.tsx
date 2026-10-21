"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { createService, updateService } from "./actions";
import type { ServiceRow } from "./services-table";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; service: ServiceRow | null };

export function ServiceDialog({ open, onOpenChange, service }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{service ? "სერვისის რედაქტირება" : "ახალი სერვისი"}</DialogTitle>
          <DialogDescription>{service ? service.name : "შეიყვანეთ დასახელება, ფასი და (სურვილისამებრ) ICD-10 კოდი"}</DialogDescription>
        </DialogHeader>
        <ServiceForm key={service?.id ?? "new"} service={service} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({ service, onDone }: { service: ServiceRow | null; onDone: () => void }) {
  const [code, setCode] = useState(service?.code ?? "");
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(service?.price ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = service
        ? await updateService({ id: service.id, code, name, price })
        : await createService({ code, name, price });
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

      <FormField id="service-code" label="ICD-10" error={errors.code} hint="არასავალდებულო, მაგ. H40.1">
        <Input
          id="service-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={30}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errors.code ? true : undefined}
          className="h-10 font-mono"
          autoFocus
        />
      </FormField>

      <FormField id="service-name" label="დასახელება" error={errors.name}>
        <Input
          id="service-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          className="h-10"
        />
      </FormField>

      <FormField id="service-price" label="ფასი (₾)" error={errors.price} hint="მაგ. 25 ან 25.50">
        <Input
          id="service-price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={errors.price ? true : undefined}
          className="h-10 tabular-nums"
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : service ? "შენახვა" : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}
