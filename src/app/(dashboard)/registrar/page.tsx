import type { Metadata } from "next";
import { PatientSearchScreen } from "@/components/patients/screens/patient-search-screen";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";

export const instant = false;

export const metadata: Metadata = { title: "პაციენტის ძებნა" };

export default async function RegistrarSearchPage({ searchParams }: PageProps<"/registrar">) {
  await requireRole("registrar");
  const { q } = await searchParams;
  return <PatientSearchScreen routes={PATIENT_ROUTES.registrar} rawQuery={q} />;
}
