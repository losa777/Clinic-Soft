import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { PatientForm } from "@/components/patients/patient-form";
import { PatientTabs } from "@/components/patients/patient-tabs";
import { buttonVariants } from "@/components/ui/button";
import { PatientVisits } from "@/components/visits/patient-visits";
import { loadPatientRecord } from "@/lib/patient-records";
import { editVisitUrlTemplate, newVisitUrl, type PatientRoutes } from "@/lib/patient-routes";
import { loadPatientVisits } from "@/lib/visit-records";

/** პაციენტი URL-ის id-ით, ან 404. როლს გამომძახებელი ამოწმებს. */
export async function loadPatientOr404(rawId: string) {
  const id = Number(rawId);
  const record = Number.isInteger(id) && id > 0 ? await loadPatientRecord({ id }) : null;
  if (!record) notFound();
  return record;
}

/** პაციენტის ბარათი: მონაცემები და ვიზიტები ჩანართებად; „პაციენტის მიღება“ — მხოლოდ რეგისტრატორთან. */
export async function PatientScreen({
  routes,
  rawId,
  canEdit,
}: {
  routes: PatientRoutes;
  rawId: string;
  canEdit: boolean;
}) {
  const record = await loadPatientOr404(rawId);
  const visits = await loadPatientVisits(record.id);
  const newVisitHref = newVisitUrl(routes, record.id);

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
        {newVisitHref && (
          <Link href={newVisitHref} className={buttonVariants({ size: "lg" })}>
            <ClipboardPlus />
            პაციენტის მიღება
          </Link>
        )}
      </div>

      <PatientTabs
        visitCount={visits.filter((v) => !v.cancelled).length}
        // key: სხვა პაციენტზე გადასვლისას ფორმა თავიდან ივსება
        info={<PatientForm key={record.id} canEdit={canEdit} initialRecord={record} />}
        visits={<PatientVisits visits={visits} newVisitHref={newVisitHref} editHref={editVisitUrlTemplate(routes, record.id)} />}
      />
    </section>
  );
}
