import type { Metadata } from "next";
import { loadPatientOr404, PatientScreen } from "@/components/patients/screens/patient-screen";
import { auditPatientView } from "@/lib/audit";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/admin/patients/[id]">): Promise<Metadata> {
  await requireRole("admin");
  const { values } = await loadPatientOr404((await params).id);
  return { title: `${values.firstName} ${values.lastName}` };
}

export default async function AdminPatientPage({ params }: PageProps<"/admin/patients/[id]">) {
  const user = await requireRole("admin");
  await auditPatientView(Number(user.id), (await params).id, "ადმინისტრატორი");
  return <PatientScreen routes={PATIENT_ROUTES.admin} rawId={(await params).id} canEdit />;
}
