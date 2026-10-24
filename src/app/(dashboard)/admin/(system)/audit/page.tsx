import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { AuditScreen } from "@/modules/audit/screen";

export const instant = false;

export const metadata: Metadata = { title: "აუდიტი" };

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePermission("audit.view");
  return <AuditScreen base="/admin/audit" params={await searchParams} patientHref={(id) => `/admin/patients/${id}`} />;
}
