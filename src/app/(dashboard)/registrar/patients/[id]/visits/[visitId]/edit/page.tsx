import type { Metadata } from "next";
import { VisitScreen } from "@/components/patients/screens/visit-screen";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";

export const instant = false;

export const metadata: Metadata = { title: "ვიზიტის რედაქტირება" };

export default async function EditVisitPage({ params }: PageProps<"/registrar/patients/[id]/visits/[visitId]/edit">) {
  await requireRole("registrar");
  const { id, visitId } = await params;
  return <VisitScreen routes={PATIENT_ROUTES.registrar} rawPatientId={id} rawVisitId={visitId} />;
}
