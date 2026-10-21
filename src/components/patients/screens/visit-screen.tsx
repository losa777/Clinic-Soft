import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VisitForm } from "@/components/visits/visit-form";
import { prisma } from "@/lib/db";
import { type PatientRoutes, patientUrl } from "@/lib/patient-routes";
import { loadVisitForEdit, loadVisitOptions } from "@/lib/visit-records";
import { nowLocal } from "@/lib/visit-schema";

const positiveInt = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** პაციენტის მიღება (rawVisitId-ის გარეშე) ან ვიზიტის რედაქტირება. */
export async function VisitScreen({
  routes,
  rawPatientId,
  rawVisitId,
}: {
  routes: PatientRoutes;
  rawPatientId: string;
  rawVisitId?: string;
}) {
  const patientId = positiveInt(rawPatientId);
  const patient = patientId
    ? await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, personalId: true, firstName: true, lastName: true, phone: true },
      })
    : null;
  if (!patient) notFound();

  let edit;
  if (rawVisitId !== undefined) {
    const visitId = positiveInt(rawVisitId);
    edit = visitId ? await loadVisitForEdit(patient.id, visitId) : null;
    if (!edit) notFound();
  }

  const { services, doctors } = await loadVisitOptions();
  // რედაქტირებისას ვიზიტის ექიმი შეიძლება უკვე გათიშული იყოს — სიაში მაინც ვაჩვენებთ
  if (edit?.doctor && !doctors.some((d) => d.id === edit.doctor!.id)) doctors.unshift(edit.doctor);
  const backHref = patientUrl(routes, patient.id);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={backHref} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          პაციენტის გვერდზე დაბრუნება
        </Link>
        <h1 className="text-xl font-semibold">{edit ? "ვიზიტის რედაქტირება" : "პაციენტის მიღება"}</h1>
        <p className="text-sm text-muted-foreground">
          {patient.firstName} {patient.lastName} · <span className="font-mono tracking-wider">{patient.personalId}</span>
          {patient.phone && ` · ${patient.phone}`}
        </p>
      </div>

      {(!services.length || !doctors.length) && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <TriangleAlert />
          <AlertTitle>{!services.length ? "სერვისები არ არის დამატებული" : "სისტემაში აქტიური ექიმი არ არის"}</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">მიმართეთ ადმინისტრატორს.</AlertDescription>
        </Alert>
      )}

      {/* key: სხვა პაციენტზე/ვიზიტზე ფორმა ყოველთვის სუფთად იწყება */}
      <VisitForm
        key={`${patient.id}-${edit?.visitId ?? "new"}`}
        patientId={patient.id}
        services={services}
        doctors={doctors}
        defaultVisitAt={nowLocal()}
        doneHref={`${backHref}?tab=visits`}
        edit={edit}
      />
    </section>
  );
}
