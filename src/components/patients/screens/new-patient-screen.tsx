import { redirect } from "next/navigation";
import { PatientForm } from "@/components/patients/patient-form";
import { prisma } from "@/lib/db";
import { type PatientRoutes, patientUrl } from "@/lib/patient-routes";
import { PERSONAL_ID_PATTERN } from "@/lib/patient-schema";

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

/** ახალი პაციენტის რეგისტრაცია (რეგისტრატორი); ძებნიდან შეიძლება მოვიდეს პირადი ნომერი ან სახელი/გვარი. */
export async function NewPatientScreen({
  routes,
  params,
}: {
  routes: PatientRoutes;
  params: Record<string, string | string[] | undefined>;
}) {
  const personalId = param(params.personalId);
  const validId = PERSONAL_ID_PATTERN.test(personalId);

  // ძებნიდან მოსული ნომერი უკვე შეიძლება დარეგისტრირდა (მაგ. სხვა ფანჯრიდან) — პირდაპირ მის გვერდზე
  if (validId) {
    const existing = await prisma.patient.findUnique({ where: { personalId }, select: { id: true } });
    if (existing) redirect(patientUrl(routes, existing.id));
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">ახალი პაციენტის რეგისტრაცია</h1>
        <p className="text-sm text-muted-foreground">შეიყვანეთ პირადი ნომერი და შეავსეთ მონაცემები</p>
      </div>
      <PatientForm
        canEdit={false}
        patientHref={routes.patients}
        initialValues={{
          personalId: validId ? personalId : "",
          firstName: param(params.firstName),
          lastName: param(params.lastName),
        }}
      />
    </section>
  );
}
