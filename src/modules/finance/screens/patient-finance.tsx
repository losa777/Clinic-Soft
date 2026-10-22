import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import type { Session } from "next-auth";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fromTetri } from "@/modules/finance/calc";
import { Money } from "@/modules/finance/components/invoice-status-badge";
import { InvoiceList } from "@/modules/finance/components/invoice-list";
import { PatientPolicies } from "@/modules/finance/components/patient-policies";
import { type FinanceRoutes, invoiceUrl, newInvoiceUrl } from "@/modules/finance/routes";
import { patientDebts } from "@/modules/finance/server/debts";
import { loadActiveCompanies, loadPatientPolicies } from "@/modules/finance/server/insurance";
import { listPatientInvoices } from "@/modules/finance/server/invoices";

type User = Session["user"];

/** პაციენტის ბარათის „ინვოისები“: ჯამური ვალი (მოთხოვნით ითვლება), ინვოისების სია, ახალი ინვოისი. */
export async function PatientInvoices({ patientId, routes, user }: { patientId: number; routes: FinanceRoutes | null; user: User }) {
  const [invoices, debts] = await Promise.all([listPatientInvoices(patientId), patientDebts(prisma, [patientId])]);
  const debt = fromTetri(debts.get(patientId) ?? 0);
  const open = invoices.filter((i) => i.status === "unpaid" || i.status === "partial").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Card size="sm" className="min-w-48">
          <CardContent>
            <p className="text-xs text-muted-foreground">ჯამური დავალიანება</p>
            <p className={`text-xl font-semibold ${Number(debt) > 0 ? "text-destructive" : ""}`}>
              <Money value={debt} />
            </p>
            <p className="text-xs text-muted-foreground">ღია ინვოისი: {open}</p>
          </CardContent>
        </Card>
        {routes && can(user, "invoices.create") && (
          <Link href={newInvoiceUrl(routes, { patientId })} className={buttonVariants({ size: "lg" })}>
            <FilePlus2 />
            ახალი ინვოისი
          </Link>
        )}
      </div>
      <InvoiceList
        rows={invoices}
        href={routes && can(user, "invoices.view") ? (id) => invoiceUrl(routes, id) : null}
        showPatient={false}
        emptyText="პაციენტს ინვოისი ჯერ არ აქვს"
      />
    </div>
  );
}

/** პაციენტის ბარათის „დაზღვევა“: პოლისები; დამატება — invoices.create ან insurance.manage. */
export async function PatientInsurance({ patientId, user }: { patientId: number; user: User }) {
  const [policies, companies] = await Promise.all([loadPatientPolicies(patientId), loadActiveCompanies()]);
  return (
    <PatientPolicies
      patientId={patientId}
      policies={policies}
      companies={companies}
      canEdit={can(user, "invoices.create") || can(user, "insurance.manage")}
      today={tbilisiToday()}
    />
  );
}
