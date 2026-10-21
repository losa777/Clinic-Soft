import type { Metadata } from "next";
import { PatientSearchScreen } from "@/components/patients/screens/patient-search-screen";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";

export const instant = false;

export const metadata: Metadata = { title: "პაციენტები" };

export default async function AdminPatientsPage({ searchParams }: PageProps<"/admin/patients">) {
  await requireRole("admin");
  const { q } = await searchParams;
  return <PatientSearchScreen routes={PATIENT_ROUTES.admin} rawQuery={q} />;
}
