import type { Metadata } from "next";
import { loadPatientOr404, PatientScreen } from "@/components/patients/screens/patient-screen";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/registrar/patients/[id]">): Promise<Metadata> {
  await requireRole("registrar");
  const { values } = await loadPatientOr404((await params).id);
  return { title: `${values.firstName} ${values.lastName}` };
}

export default async function PatientPage({ params }: PageProps<"/registrar/patients/[id]">) {
  await requireRole("registrar");
  return <PatientScreen routes={PATIENT_ROUTES.registrar} rawId={(await params).id} canEdit={false} />;
}
