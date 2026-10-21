import type { Metadata } from "next";
import { VisitScreen } from "@/components/patients/screens/visit-screen";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";

export const instant = false;

export const metadata: Metadata = { title: "პაციენტის მიღება" };

export default async function NewVisitPage({ params }: PageProps<"/registrar/patients/[id]/visits/new">) {
  await requireRole("registrar");
  return <VisitScreen routes={PATIENT_ROUTES.registrar} rawPatientId={(await params).id} />;
}
