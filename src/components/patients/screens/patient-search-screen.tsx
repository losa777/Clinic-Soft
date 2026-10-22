import Link from "next/link";
import { ArrowRight, FilePlus2, SearchX, UserPlus } from "lucide-react";
import { PatientSearchInput } from "@/components/patients/patient-search-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/dal";
import { type PatientSearchRow, SEARCH_LIMIT, searchPatients } from "@/lib/patient-records";
import { type PatientRoutes, patientUrl } from "@/lib/patient-routes";
import { can } from "@/lib/permissions";
import { DebtBadge } from "@/modules/finance/components/invoice-status-badge";
import { newInvoiceUrl } from "@/modules/finance/routes";

/** ძებნის ტექსტიდან რეგისტრაციის ფორმის წინასწარი მნიშვნელობები. */
function registerHref(newPatient: string, query: string, kind: "personalId" | "name") {
  const params = new URLSearchParams();
  if (kind === "personalId") {
    if (query.length === 11) params.set("personalId", query);
  } else if (!/[a-z]/i.test(query)) {
    // ქართული სახელი/გვარი გადადის ფორმაში (ლათინური ძებნა — არა, ის ქართულ ველებში არ ჯდება)
    const [firstName, ...rest] = query.split(" ");
    params.set("firstName", firstName);
    if (rest.length) params.set("lastName", rest.join(" "));
  }
  const qs = params.toString();
  return qs ? `${newPatient}?${qs}` : newPatient;
}

/**
 * პაციენტის ძებნა სახელით/გვარით ან პირადი ნომრით (რეგისტრატორი და ადმინი).
 * რეგისტრაციის ღილაკი ჩანს მხოლოდ იმ როლზე, რომელსაც ეს აქვს (routes), ინვოისის — უფლებით (invoices.create).
 * ვალიანი პაციენტი გაფრთხილების ნიშნით ჩანს.
 */
export async function PatientSearchScreen({ routes, rawQuery }: { routes: PatientRoutes; rawQuery: string | string[] | undefined }) {
  const query = (typeof rawQuery === "string" ? rawQuery : "").trim().replace(/\s+/g, " ");
  const [result, user] = await Promise.all([searchPatients(query), requireUser()]);
  const { newPatient } = routes;
  const canInvoice = can(user, "invoices.create");

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">პაციენტის ძებნა</h1>
        <p className="text-sm text-muted-foreground">მოძებნეთ სახელით და გვარით ან პირადი ნომრით</p>
      </div>

      <PatientSearchInput action={routes.search} initialQuery={query} />

      {result.status === "invalid" && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result.status === "ok" && result.rows.length === 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <SearchX />
          <AlertTitle>პაციენტი ვერ მოიძებნა</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 text-amber-800 dark:text-amber-200">
            <span>
              „{query}“ — ასეთი პაციენტი ბაზაში არ არის.
              {newPatient && " შეგიძლიათ დაარეგისტრიროთ როგორც ახალი პაციენტი."}
            </span>
            {newPatient && (
              <Link href={registerHref(newPatient, query, result.kind)} className={buttonVariants({ size: "lg" })}>
                <UserPlus />
                ახალი პაციენტის რეგისტრაცია
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {result.status === "ok" && result.rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {result.hasMore
              ? `ნაჩვენებია პირველი ${SEARCH_LIMIT} შედეგი — დააზუსტეთ ძებნა`
              : `ნაპოვნია: ${result.rows.length}`}
          </p>
          <ul className="flex flex-col gap-3">
            {result.rows.map((p) => (
              <li key={p.id}>
                <PatientCard
                  routes={routes}
                  patient={p}
                  invoiceHref={routes.finance && canInvoice ? newInvoiceUrl(routes.finance, { patientId: p.id }) : null}
                />
              </li>
            ))}
          </ul>
          {newPatient && (
            <p className="text-sm text-muted-foreground">
              სასურველი პაციენტი სიაში არ არის?{" "}
              {/* ნაპოვნი პაციენტები ამ სახელით/ნომრით უკვე არსებობენ — ახალი პაციენტის ფორმა ცარიელი იხსნება */}
              <Link href={newPatient} className="font-medium text-primary hover:underline">
                ახალი პაციენტის რეგისტრაცია
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PatientCard({ routes, patient: p, invoiceHref }: { routes: PatientRoutes; patient: PatientSearchRow; invoiceHref: string | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-5">
          <Field label="სახელი" value={p.firstName} strong />
          <Field label="გვარი" value={p.lastName} strong />
          <Field label="ტელეფონი" value={p.phone ?? "—"} />
          <Field label="პირადი ნომერი" value={p.personalId} mono />
          <Field label="დაბადების თარიღი" value={p.birthDate} />
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <DebtBadge debt={p.debt} />
          {invoiceHref && (
            <Link href={invoiceHref} className={buttonVariants({ size: "lg" })}>
              <FilePlus2 />
              ინვოისი
            </Link>
          )}
          <Link href={patientUrl(routes, p.id)} className={buttonVariants({ variant: "outline", size: "lg" })}>
            პაციენტის სრული ინფორმაცია
            <ArrowRight />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`truncate ${strong ? "text-base font-semibold" : ""} ${mono ? "font-mono tracking-wider" : ""}`}>{value}</dd>
    </div>
  );
}
