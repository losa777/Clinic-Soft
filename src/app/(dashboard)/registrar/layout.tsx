import { NewPatientDialogProvider } from "@/components/patients/new-patient-dialog";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";
import { RegistrarNav } from "./registrar-nav";

export const instant = false;

export default async function RegistrarLayout({ children }: { children: React.ReactNode }) {
  await requireRole("registrar");

  return (
    <NewPatientDialogProvider patientHref={PATIENT_ROUTES.registrar.patients}>
      <div className="flex flex-1 flex-col gap-6">
        <RegistrarNav />
        {children}
      </div>
    </NewPatientDialogProvider>
  );
}
