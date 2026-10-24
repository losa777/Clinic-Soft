import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { DOCTOR_PATIENTS } from "@/modules/emr/screens/doctor-screens";
import { PrescriptionPrintScreen } from "@/modules/emr/screens/prescription-print";
import { positiveInt } from "@/modules/finance/params";

export const instant = false;

export const metadata: Metadata = { title: "რეცეპტი" };

export default async function PrescriptionPage({ params }: PageProps<"/doctor/encounters/[id]/prescription">) {
  const user = await requirePermission("emr.view");
  const id = positiveInt((await params).id);
  if (!id) notFound();
  await audit({ userId: Number(user.id), action: "print", entity: "encounter", entityId: id, details: "რეცეპტი" });
  return <PrescriptionPrintScreen encounterId={id} backHref={(patientId) => `${DOCTOR_PATIENTS}/${patientId}?tab=orders`} />;
}
