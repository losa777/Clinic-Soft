"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PatientForm } from "@/components/patients/patient-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { newPatientFormData } from "@/lib/patient-actions";
import type { PatientFormValues } from "@/lib/patient-schema";
import { cn } from "@/lib/utils";

/**
 * ახალი პაციენტის რეგისტრაცია მოდალში (რეგისტრატორი; ჩართვა — REGISTER_IN_DIALOG, src/lib/patient-routes.ts).
 * ფორმა იგივეა, რაც /registrar/new გვერდზე. შენახვის შემდეგ — პაციენტის გვერდზე; ნებისმიერი გადასვლისას მოდალი იხურება.
 */
type Prefill = Partial<Pick<PatientFormValues, "personalId" | "firstName" | "lastName">>;

const OpenContext = createContext<((prefill?: Prefill) => void) | null>(null);

export function NewPatientDialogProvider({ patientHref, children }: { patientHref: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // key: ყოველ გახსნაზე ფორმა თავიდან (სუფთა ან ძებნიდან შევსებული)
  const [state, setState] = useState<{ key: number; prefill: Prefill } | null>(null);
  const [data, setData] = useState<{ insuranceCompanies?: { id: number; name: string }[] } | null>(null);
  // გვერდზე გადასვლა (შენახვა, „პაციენტის სრული ინფორმაცია“, მენიუ) — მოდალი იხურება (state-ის შესწორება რენდერისას)
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setState(null);
  }

  function open(prefill: Prefill = {}) {
    setState({ key: Date.now(), prefill });
    newPatientFormData()
      .then(setData)
      .catch(() => toast.error("ფორმა ვერ ჩაიტვირთა. სცადეთ თავიდან"));
  }

  return (
    <OpenContext value={open}>
      {children}
      {/* გარეთ დაჭერით არ იხურება — შემთხვევით შევსებული მონაცემები არ დაიკარგოს */}
      <Dialog open={state !== null} onOpenChange={(next) => !next && setState(null)} disablePointerDismissal>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>ახალი პაციენტის რეგისტრაცია</DialogTitle>
            <DialogDescription>შეიყვანეთ პირადი ნომერი და შეავსეთ მონაცემები</DialogDescription>
          </DialogHeader>
          {state &&
            (data ? (
              <PatientForm
                key={state.key}
                canEdit={false}
                patientHref={patientHref}
                insuranceCompanies={data.insuranceCompanies}
                initialValues={state.prefill}
                onSaved={() => setState(null)}
              />
            ) : (
              <p className="flex items-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                იტვირთება...
              </p>
            ))}
        </DialogContent>
      </Dialog>
    </OpenContext>
  );
}

/** რეგისტრაციის ღილაკი (მენიუ, ძებნის შედეგი); prefill — ძებნიდან გადმოტანილი ნომერი ან სახელი. */
export function NewPatientButton({
  prefill,
  className,
  variant = "default",
  children,
}: {
  prefill?: Prefill;
  className?: string;
  variant?: "default" | "link" | "tab";
  children?: React.ReactNode;
}) {
  const open = useContext(OpenContext);
  if (!open) return null;
  const content = children ?? (
    <>
      <UserPlus className="size-4" />
      ახალი პაციენტის რეგისტრაცია
    </>
  );
  if (variant === "default") {
    return (
      <Button type="button" size="lg" className={className} onClick={() => open(prefill)}>
        {content}
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => open(prefill)}
      className={cn(variant === "link" && "font-medium text-primary hover:underline", className)}
    >
      {content}
    </button>
  );
}
