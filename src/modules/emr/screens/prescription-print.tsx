import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/modules/finance/components/print-button";
import { loadPrescriptionPrint } from "@/modules/emr/server/orders";

/** ბეჭდვისას მხოლოდ რეცეპტი ჩანს (A4). */
const PRINT_CSS = `@page { size: A4; margin: 15mm; }
@media print {
  body * { visibility: hidden !important; }
  #prescription, #prescription * { visibility: visible !important; }
  #prescription { position: absolute; left: 0; top: 0; box-shadow: none !important; }
  html, body { background: #fff !important; }
}`;

/**
 * რეცეპტის ბეჭდვა (A4): კლინიკა, პაციენტი, დიაგნოზი, მედიკამენტები, ექიმის ხელმოწერის ადგილი.
 * ციფრული ხელმოწერით დამოწმებული PDF — ეტაპი 5 (დოკუმენტები).
 */
export async function PrescriptionPrintScreen({ encounterId, backHref }: { encounterId: number; backHref: (patientId: number) => string }) {
  const d = await loadPrescriptionPrint(encounterId);
  if (!d) notFound();

  return (
    <div className="flex flex-col gap-4">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={backHref(d.patient.id)} className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft />
          პაციენტის ბარათი
        </Link>
        <PrintButton />
      </div>

      <div className="flex justify-center rounded-xl bg-muted/40 p-4 print:bg-transparent print:p-0">
        <article id="prescription" className="w-[180mm] max-w-full bg-white p-8 text-sm text-black shadow-sm">
          <header className="mb-6 border-b border-black pb-3 text-center">
            <p className="text-xl font-bold">{d.clinic.name}</p>
            {d.clinic.address && <p>{d.clinic.address}</p>}
            {d.clinic.phone && <p>ტელ. {d.clinic.phone}</p>}
          </header>

          <h1 className="mb-4 text-center text-lg font-bold">რეცეპტი</h1>
          <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-neutral-600">თარიღი</dt>
            <dd>{d.date}</dd>
            <dt className="text-neutral-600">პაციენტი</dt>
            <dd className="font-semibold">{d.patient.name}</dd>
            <dt className="text-neutral-600">პირადი ნომერი</dt>
            <dd>{d.patient.personalId}</dd>
            <dt className="text-neutral-600">დაბადების თარიღი</dt>
            <dd>{d.patient.birthDate}</dd>
            {d.diagnosis && (
              <>
                <dt className="text-neutral-600">დიაგნოზი</dt>
                <dd>{d.diagnosis}</dd>
              </>
            )}
          </dl>

          {d.items.length === 0 ? (
            <p>მედიკამენტი არ არის დანიშნული.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {d.items.map((p, i) => (
                <li key={p.id} className="flex gap-3">
                  <span className="font-semibold">Rp. {i + 1}.</span>
                  <div>
                    <p className="font-semibold">
                      {p.drugName}
                      {p.form && `, ${p.form}`} — {p.dose}
                    </p>
                    <p>
                      S. {p.frequency}
                      {p.duration && `, ${p.duration}`}
                    </p>
                    {p.note && <p className="text-neutral-700">{p.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <footer className="mt-16 flex items-end justify-between gap-6">
            <div>
              <p className="font-semibold">ექ. {d.doctor.name}</p>
              {d.doctor.specialty && <p className="text-neutral-600">{d.doctor.specialty}</p>}
            </div>
            <div className="w-56 border-t border-black pt-1 text-center text-neutral-600">ხელმოწერა / ბეჭედი</div>
          </footer>
        </article>
      </div>
    </div>
  );
}
