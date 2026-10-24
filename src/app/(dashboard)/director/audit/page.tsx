import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { AuditScreen } from "@/modules/audit/screen";

export const instant = false;

export const metadata: Metadata = { title: "აუდიტი" };

/** დირექტორი — მხოლოდ თუ ადმინმა მისცა უფლება „აუდიტის ჟურნალი“ (ნაგულისხმევად — არა). */
export default async function DirectorAuditPage({ searchParams }: PageProps<"/director/audit">) {
  await requirePermission("audit.view");
  return <AuditScreen base="/director/audit" params={await searchParams} patientHref={null} />;
}
