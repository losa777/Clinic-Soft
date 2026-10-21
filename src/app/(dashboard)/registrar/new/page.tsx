import type { Metadata } from "next";
import { NewPatientScreen } from "@/components/patients/screens/new-patient-screen";
import { requireRole } from "@/lib/dal";
import { PATIENT_ROUTES } from "@/lib/patient-routes";

export const instant = false;

export const metadata: Metadata = { title: "ახალი პაციენტი" };

export default async function NewPatientPage({ searchParams }: PageProps<"/registrar/new">) {
  await requireRole("registrar");
  return <NewPatientScreen routes={PATIENT_ROUTES.registrar} params={await searchParams} />;
}
