import { notFound } from "next/navigation";
import { ClipboardList, Stethoscope } from "lucide-react";
import type { Session } from "next-auth";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { PatientTabs } from "@/components/patients/patient-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, tbilisiToday } from "@/lib/appointment-slots";
import { can } from "@/lib/permissions";
import { MedicalProfile } from "@/modules/emr/components/medical-profile";
import { AllergyBanner, EncounterHistory, FilesList, StudiesList } from "@/modules/emr/components/record-sections";
import { NoShowButton, StartVisitButton } from "@/modules/emr/components/visit-buttons";
import { audit } from "@/modules/emr/server/audit";
import { loadEncounterForm, loadTemplates } from "@/modules/emr/server/encounter";
import { loadEncounterHistory, loadFiles, loadPatientCard, loadStudies } from "@/modules/emr/server/patient-card";
import { EncounterForm } from "@/modules/emr/components/encounter-form";
import { MedicalDocuments } from "@/modules/emr/components/medical-documents";
import { BookingLinks, OrdersPanel } from "@/modules/emr/components/orders-panel";
import { loadCompletionPreviewForView } from "@/modules/emr/server/completion";
import { loadMedicalDocuments } from "@/modules/emr/server/documents";
import { loadEncounterOrders, loadOrderOptions } from "@/modules/emr/server/orders";
import { doctorBookingHref } from "./doctor-booking";
import { positiveInt, type SearchParams, withParams } from "@/modules/finance/params";

type User = Session["user"];

/** ჯავშნის კონტექსტი (განრიგიდან გახსნისას): დრო, სტატუსი, ვიზიტის ჩანაწერი. own — ამ ექიმის ჯავშანია. */
export type AppointmentContext = {
  id: number;
  date: string;
  start: string;
  status: AppointmentStatus;
  own: boolean;
  isPast: boolean;
  encounter: { id: number; status: "draft" | "completed" } | null;
};

/**
 * პაციენტის ელექტრონული ჩანაწერი: ძირითადი მონაცემები (წასაკითხად), ალერგიები (წითლად, ზემოთ), სამედიცინო პროფილი,
 * ჩანართები: ვიზიტი, ისტორია, კვლევები, დანიშნულებები, დოკუმენტები. ყოველი ნახვა აუდიტში იწერება.
 * href — ამ ხედის მისამართი (?tab, ?hpage ბმულებისთვის), params — მიმდინარე URL პარამეტრები.
 */
export async function PatientRecord({
  patientId,
  user,
  appointment,
  href,
  params,
}: {
  patientId: number;
  user: User;
  appointment: AppointmentContext | null;
  href: string;
  params: SearchParams;
}) {
  const userId = Number(user.id);
  const historyPage = positiveInt(params.hpage) ?? 1;
  const encounterId = appointment?.encounter?.id;
  const [card, history, studies, files, encounter, templates, orders, orderOptions, documents] = await Promise.all([
    loadPatientCard(patientId),
    loadEncounterHistory(patientId, historyPage, userId),
    loadStudies(patientId),
    loadFiles(patientId),
    encounterId ? loadEncounterForm(encounterId, userId) : Promise.resolve(null),
    encounterId ? loadTemplates(userId) : Promise.resolve([]),
    encounterId ? loadEncounterOrders(encounterId) : Promise.resolve(null),
    encounterId ? loadOrderOptions() : Promise.resolve(null),
    loadMedicalDocuments(patientId),
  ]);
  if (!card) notFound();
  // დასრულების ბილინგი — მხოლოდ საკუთარ, დაუსრულებელ ვიზიტზე
  const completion = encounter?.editable ? await loadCompletionPreviewForView(encounter.id) : null;
  await audit({ userId, action: "view", entity: "patient", entityId: patientId, patientId, details: appointment ? `ჯავშანი ${appointment.id}` : null });

  const canEdit = can(user, "emr.edit");
  const bookingHrefs = can(user, "appointments.book")
    ? { followup: doctorBookingHref(patientId, "followup"), referral: doctorBookingHref(patientId, "referral") }
    : null;
  // ჩანართის ბმული: განრიგის ფილტრები რჩება, appointment/tab/hpage — თავიდან
  const keep = Object.fromEntries(
    Object.entries(params).filter(([key, v]) => typeof v === "string" && !["appointment", "tab", "hpage"].includes(key)),
  ) as Record<string, string>;
  const tabHref = (tab: string, extra: Record<string, number> = {}) =>
    withParams(href, { ...keep, ...(appointment ? { appointment: appointment.id } : {}), tab, ...extra });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{card.name}</h2>
          <p className="text-sm text-muted-foreground">
            {card.age} წ. · {card.gender} · დაბ. {card.birthDate} · <span className="font-mono">{card.personalId}</span>
            {card.phone && ` · ${card.phone}`}
            {card.address && ` · ${card.address}`}
          </p>
        </div>
        {appointment && <AppointmentBar appointment={appointment} visitHref={tabHref("visit")} canEdit={canEdit} />}
      </div>

      <AllergyBanner allergies={card.allergies} />
      <MedicalProfile card={card} canEdit={canEdit} />

      <PatientTabs
        tabs={[
          {
            value: "visit",
            label: "ვიზიტი",
            content: encounter ? (
              <EncounterForm key={encounter.id} data={encounter} templates={templates} completion={completion} />
            ) : (
              <VisitTab appointment={appointment} />
            ),
          },
          {
            value: "history",
            label: `ისტორია (${history.total})`,
            content: <EncounterHistory history={history} pageHref={(page) => tabHref("history", { hpage: page })} />,
          },
          { value: "studies", label: `კვლევები (${studies.length})`, content: <StudiesList studies={studies} /> },
          {
            value: "orders",
            label: orders ? `დანიშნულებები (${orders.prescriptions.length + orders.orders.length})` : "დანიშნულებები",
            content:
              encounter && orders && orderOptions ? (
                <OrdersPanel
                  encounterId={encounter.id}
                  editable={encounter.editable}
                  data={orders}
                  options={orderOptions}
                  printHref={`/doctor/encounters/${encounter.id}/prescription`}
                  bookingHrefs={bookingHrefs}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <Placeholder icon={<ClipboardList />} text="დანიშნულებები ვიზიტზე ემატება — აირჩიეთ ვიზიტი დღის განრიგიდან. წინა ვიზიტების დანიშნულებები — „ისტორიაში“." />
                  {bookingHrefs && <BookingLinks hrefs={bookingHrefs} />}
                </div>
              ),
          },
          {
            value: "documents",
            label: `დოკუმენტები (${documents.length + files.length})`,
            content: (
              <div className="flex flex-col gap-4">
                <MedicalDocuments
                  docs={documents}
                  encounterId={appointment?.own && encounter ? encounter.id : null}
                  userId={userId}
                  canEdit={canEdit}
                  canSign={can(user, "documents.sign")}
                />
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">პაციენტის ფაილები</h3>
                  <FilesList files={files} />
                </section>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function AppointmentBar({ appointment: a, visitHref, canEdit }: { appointment: AppointmentContext; visitHref: string; canEdit: boolean }) {
  const today = tbilisiToday();
  const waiting = a.status === "booked" || a.status === "arrived";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground tabular-nums">
        {a.date === today ? "დღეს" : formatDate(a.date)}, {a.start}
      </span>
      <AppointmentStatusBadge status={a.status} />
      {a.own && canEdit && waiting && a.date <= today && <StartVisitButton appointmentId={a.id} href={visitHref} />}
      {a.own && canEdit && waiting && a.isPast && <NoShowButton appointmentId={a.id} />}
    </div>
  );
}

function VisitTab({ appointment: a }: { appointment: AppointmentContext | null }) {
  if (!a) return <Placeholder icon={<Stethoscope />} text="ვიზიტის ფორმისთვის აირჩიეთ ვიზიტი დღის განრიგიდან." />;
  return (
    <Placeholder
      icon={<Stethoscope />}
      text={a.own ? "მიღება ჯერ არ დაწყებულა — დააჭირეთ „მიღების დაწყებას“." : "ვიზიტი სხვა ექიმისაა — ჩანაწერი მხოლოდ სანახავადაა."}
    />
  );
}

function Placeholder({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 text-sm text-muted-foreground [&_svg]:size-5">
        {icon}
        {text}
      </CardContent>
    </Card>
  );
}
