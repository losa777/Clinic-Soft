import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FilePlus2, ScrollText } from "lucide-react";
import { PatientForm } from "@/components/patients/patient-form";
import { PatientTabs } from "@/components/patients/patient-tabs";
import { buttonVariants } from "@/components/ui/button";
import { addDays, tbilisiToday } from "@/lib/appointment-slots";
import { requireUser } from "@/lib/dal";
import { loadPatientRecord } from "@/lib/patient-records";
import { type PatientRoutes } from "@/lib/patient-routes";
import { can } from "@/lib/permissions";
import { newInvoiceUrl } from "@/modules/finance/routes";
import { PatientInsurance, PatientInvoices } from "@/modules/finance/screens/patient-finance";

/** პაციენტი URL-ის id-ით, ან 404. როლს გამომძახებელი ამოწმებს. */
export async function loadPatientOr404(rawId: string) {
  const id = Number(rawId);
  const record = Number.isInteger(id) && id > 0 ? await loadPatientRecord({ id }) : null;
  if (!record) notFound();
  return record;
}

/** პაციენტის ბარათი: მონაცემები, ინვოისები და დაზღვევა ჩანართებად; ინვოისის შექმნა — უფლებით (invoices.create). */
export async function PatientScreen({
  routes,
  rawId,
  canEdit,
}: {
  routes: PatientRoutes;
  rawId: string;
  canEdit: boolean;
}) {
  const [record, user] = await Promise.all([loadPatientOr404(rawId), requireUser()]);
  const finance = routes.finance;
  const newInvoiceHref = finance && can(user, "invoices.create") ? newInvoiceUrl(finance, { patientId: record.id }) : null;
  const auditHref = routes.audit && can(user, "audit.view") ? `${routes.audit}?patient=${record.id}&from=${addDays(tbilisiToday(), -365)}` : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={`${routes.search}?q=${encodeURIComponent(record.values.personalId)}`}
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            ძებნაზე დაბრუნება
          </Link>
          <h1 className="text-xl font-semibold">
            {record.values.firstName} {record.values.lastName}
          </h1>
          <p className="font-mono text-sm tracking-wider text-muted-foreground">{record.values.personalId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {auditHref && (
            <Link href={auditHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <ScrollText />
              წვდომის ისტორია
            </Link>
          )}
          {newInvoiceHref && (
            <Link href={newInvoiceHref} className={buttonVariants({ size: "lg" })}>
              <FilePlus2 />
              ახალი ინვოისი
            </Link>
          )}
        </div>
      </div>

      <PatientTabs
        tabs={[
          // key: სხვა პაციენტზე გადასვლისას ფორმა თავიდან ივსება
          { value: "info", label: "პაციენტის მონაცემები", content: <PatientForm key={record.id} canEdit={canEdit} initialRecord={record} /> },
          { value: "invoices", label: "ინვოისები", content: <PatientInvoices patientId={record.id} routes={finance} user={user} /> },
          { value: "insurance", label: "დაზღვევა", content: <PatientInsurance patientId={record.id} user={user} /> },
        ]}
      />
    </section>
  );
}
