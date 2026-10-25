import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import { ArrowLeft, FileSpreadsheet, Filter } from "lucide-react";
import { PatientTabs } from "@/components/patients/patient-tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditOnce } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { MedicalDocuments } from "@/modules/emr/components/medical-documents";
import { MedicalProfile } from "@/modules/emr/components/medical-profile";
import { AllergyBanner, EncounterHistory, FilesList, StudiesList } from "@/modules/emr/components/record-sections";
import { SurgicalBadge } from "@/modules/emr/components/surgical-badge";
import { loadMedicalDocuments } from "@/modules/emr/server/documents";
import { loadEncounterHistory, loadFiles, loadPatientCard, loadStudies } from "@/modules/emr/server/patient-card";
import { DateInput, FilterField, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { columnOf } from "@/modules/reporting/columns";
import { CasesTable } from "@/modules/reporting/components/cases-table";
import { ColumnPicker } from "@/modules/reporting/components/column-picker";
import { DoctorFilter } from "@/modules/reporting/components/doctor-filter";
import { TemplateBar } from "@/modules/reporting/components/template-bar";
import { EXPORT_URL, exportUrl, filterQuery, parseFilter, PORTAL_OPTIONS, type ReportFilter, SCOPE_OPTIONS } from "@/modules/reporting/filter";
import { reportingSeesPatient, seesAllPatients } from "@/modules/reporting/server/access";
import { EXPORT_MAX_ROWS, loadReportRows, reportDoctors } from "@/modules/reporting/server/rows";
import { loadColumns, loadTemplates } from "@/modules/reporting/server/templates";

type User = Session["user"];

export const REPORTING_ROUTES = { cases: "/reporting", export: "/reporting/export", patients: "/reporting/patients" } as const;

const CASES_PAGE_SIZE = 100;
const PREVIEW_ROWS = 20;

/** ფილტრის ველები (ორივე გვერდზე ერთნაირი). */
async function FilterFields({ filter, allPatients }: { filter: ReportFilter; allPatients: boolean }) {
  const doctors = await reportDoctors();
  return (
    <>
      <FilterField label="დან">
        <DateInput name="from" value={filter.from} />
      </FilterField>
      <FilterField label="მდე">
        <DateInput name="to" value={filter.to} />
      </FilterField>
      {allPatients && (
        <FilterField label="ვიზიტები">
          <NativeSelect name="scope" value={filter.scope} options={SCOPE_OPTIONS} />
        </FilterField>
      )}
      <FilterField label="პორტალი">
        <NativeSelect name="portal" value={filter.portal} options={PORTAL_OPTIONS} />
      </FilterField>
      <FilterField label="ექიმი">
        <DoctorFilter key={filter.doctorId ?? 0} doctors={doctors} value={filter.doctorId} />
      </FilterField>
    </>
  );
}

/** შემთხვევები: საოპერაციო ვიზიტები (ნაგულისხმევად ასატვირთი), პაციენტის ბარათის ბმული, ატვირთვის მონიშვნა. */
export async function CasesScreen({ user, params }: { user: User; params: SearchParams }) {
  const allPatients = seesAllPatients(user);
  const filter = parseFilter(params, allPatients);
  const page = positiveInt(params.page) ?? 1;
  const { rows, total } = await loadReportRows(filter, CASES_PAGE_SIZE, (page - 1) * CASES_PAGE_SIZE);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">საოპერაციო შემთხვევები</h1>
        <p className="text-sm text-muted-foreground">
          ვიზიტები, რომლებიც ექიმმა მონიშნა „საოპერაციოდ“. მონიშნეთ საჭირო ხაზები → „Excel — მონიშნული“ (სვეტები — „Excel ექსპორტის“
          გვერდზე არჩეული); ატვირთვის შემდეგ — „ატვირთულად მონიშვნა“.
        </p>
      </div>
      <Form action={REPORTING_ROUTES.cases} replace scroll={false} className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-3">
        <FilterFields filter={filter} allPatients={allPatients} />
        <Button type="submit" size="lg">
          ფილტრი
        </Button>
      </Form>
      <p className="text-sm text-muted-foreground">ნაპოვნია: {total}</p>
      {rows.length > 0 ? (
        <CasesTable
          patientHref={REPORTING_ROUTES.patients}
          canMark={can(user, "reporting.export")}
          exportHref={withParams(EXPORT_URL, { scope: filter.scope === "all" ? "all" : null })}
          columnsHref={REPORTING_ROUTES.export}
          rows={rows.map((r) => ({
            encounterId: r.encounterId,
            patientId: r.patientId,
            visitDate: r.visitDate,
            name: `${r.lastName} ${r.firstName}`,
            personalId: r.personalId,
            doctor: r.doctor,
            diagnosis: r.primaryCode ? `${r.primaryCode} ${r.primaryName}` : "",
            form100: r.form100Number,
            surgical: r.surgical === "კი",
            uploadedAt: r.portalUploadedAt,
          }))}
        />
      ) : (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">ამ ფილტრით ვიზიტი არ არის</p>
      )}
      <Pager page={page} pageCount={Math.ceil(total / CASES_PAGE_SIZE)} href={(p) => withParams(REPORTING_ROUTES.cases, { ...filterQuery(filter), page: p })} />
    </section>
  );
}

/**
 * ექსპორტი: სვეტების არჩევა (მაშინვე ინახება — მთავარი გვერდის „Excel — მონიშნული“-ც ამ სვეტებით გადის), შაბლონები,
 * ფილტრით ექსპორტი (ყველა შესაბამისი ვიზიტი) და წინასწარი ცხრილი.
 */
export async function ExportScreen({ user, params }: { user: User; params: SearchParams }) {
  const allPatients = seesAllPatients(user);
  const filter = { ...parseFilter(params, allPatients), ids: null };
  const [columns, { rows, total }, templates] = await Promise.all([
    loadColumns(Number(user.id)),
    loadReportRows(filter, PREVIEW_ROWS),
    loadTemplates(Number(user.id)),
  ]);
  const key = columns.join(",");

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Excel ექსპორტი</h1>
        <p className="text-sm text-muted-foreground">
          მონიშნეთ სვეტები — არჩევანი მაშინვე ინახება. კონკრეტული პაციენტების ექსპორტი — „საოპერაციო შემთხვევებში“ მონიშვნით
          („Excel — მონიშნული“); აქედან — ყველა ვიზიტი ფილტრით. ერთი ხაზი = ერთი ვიზიტი.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">1. სვეტები</h2>
        <TemplateBar columns={columns} templates={templates.map((t) => ({ id: t.id, name: t.name, active: t.columns.join(",") === key }))} />
        <ColumnPicker key={key} initial={columns} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">2. ექსპორტი ფილტრით</h2>
        <Form action={REPORTING_ROUTES.export} replace scroll={false} className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-3">
          <FilterFields filter={filter} allPatients={allPatients} />
          <Button type="submit" size="lg" variant="outline">
            <Filter />
            ფილტრი
          </Button>
        </Form>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            ფილტრით ნაპოვნია: {total}
            {total > PREVIEW_ROWS && ` · ქვემოთ ჩანს პირველი ${PREVIEW_ROWS}`}
            {total > EXPORT_MAX_ROWS && ` · Excel-ში გავა პირველი ${EXPORT_MAX_ROWS} — შეამცირეთ პერიოდი`}
          </p>
          {total > 0 && (
            <a href={exportUrl(filter)} className={buttonVariants({ size: "lg" })} download>
              <FileSpreadsheet />
              Excel — ყველა ({Math.min(total, EXPORT_MAX_ROWS)})
            </a>
          )}
        </div>
      </section>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap">
                    {columnOf(c).label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.encounterId}>
                  {columns.map((c) => (
                    <TableCell
                      key={c}
                      className={cn("max-w-64 align-top", c === "personalId" && "font-mono", c === "measurements" ? "whitespace-pre-line" : "truncate")}
                      title={r[c]}
                    >
                      {r[c] || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">ამ ფილტრით ვიზიტი არ არის</p>
      )}
    </section>
  );
}

/**
 * პაციენტის ჩანაწერი ანგარიშგებისთვის — მხოლოდ სანახავად: მონაცემები, ისტორია, კვლევები, ხელმოწერილი დოკუმენტები
 * (ფორმა 100), ფაილები. reporting.all_patients-ის გარეშე — მხოლოდ საოპერაციო პაციენტი. ნახვა აუდიტში იწერება.
 */
export async function ReportingPatientScreen({ user, rawId, params }: { user: User; rawId: string; params: SearchParams }) {
  const patientId = Number(rawId);
  if (!Number.isSafeInteger(patientId) || patientId <= 0 || !(await reportingSeesPatient(user, patientId))) notFound();
  const userId = Number(user.id);
  const href = `${REPORTING_ROUTES.patients}/${patientId}`;
  const historyPage = positiveInt(params.hpage) ?? 1;
  const [card, history, studies, files, documents] = await Promise.all([
    loadPatientCard(patientId),
    loadEncounterHistory(patientId, historyPage, userId),
    loadStudies(patientId),
    loadFiles(patientId),
    loadMedicalDocuments(patientId),
  ]);
  if (!card) notFound();
  await auditOnce({ userId, action: "view", entity: "patient", entityId: patientId, patientId, details: "ანგარიშგება" });
  // დრაფტი ჯერ დოკუმენტი არ არის (ნომერი — ხელმოწერისას) — ანგარიშგებას მხოლოდ ხელმოწერილი სჭირდება
  const signed = documents.filter((d) => d.status !== "draft");

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link href={REPORTING_ROUTES.cases} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        შემთხვევები
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {card.name}
          {card.surgical && <SurgicalBadge label={`საოპერაციო · ${card.surgical.at}`} uploaded={card.surgical.uploaded} />}
        </h1>
        <p className="text-sm text-muted-foreground">
          {card.age} წ. · {card.gender} · დაბ. {card.birthDate} · <span className="font-mono">{card.personalId}</span>
          {card.phone && ` · ${card.phone}`}
          {card.address && ` · ${card.address}`}
          {card.cardNumber && ` · ბარათი № ${card.cardNumber}`}
        </p>
      </div>
      <AllergyBanner allergies={card.allergies} />
      <MedicalProfile card={card} canEdit={false} />
      <PatientTabs
        tabs={[
          {
            value: "history",
            label: `ისტორია (${history.total})`,
            content: <EncounterHistory history={history} pageHref={(page) => withParams(href, { tab: "history", hpage: page })} />,
          },
          {
            value: "documents",
            label: `დოკუმენტები (${signed.length + files.length})`,
            content: (
              <div className="flex flex-col gap-4">
                <MedicalDocuments docs={signed} encounterId={null} userId={userId} canEdit={false} canSign={false} stampAvailable={false} />
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">პაციენტის ფაილები</h3>
                  <FilesList files={files} />
                </section>
              </div>
            ),
          },
          { value: "studies", label: `კვლევები (${studies.length})`, content: <StudiesList studies={studies} /> },
        ]}
      />
    </div>
  );
}
