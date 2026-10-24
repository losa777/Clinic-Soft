import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { toDef } from "@/modules/emr/server/measurements";
import { positiveInt } from "@/modules/finance/params";
import { SpecialtyMeasurements } from "./specialty-measurements";

export const instant = false;

export const metadata: Metadata = { title: "სპეციალობის მაჩვენებლები" };

export default async function SpecialtyMeasurementsPage({ params }: PageProps<"/admin/specialties/[id]">) {
  await requireRole("admin");
  const id = positiveInt((await params).id);
  if (!id) notFound();
  const [specialty, catalog] = await Promise.all([
    prisma.specialty.findUnique({
      where: { id },
      include: {
        measurements: {
          include: { definition: { include: { _count: { select: { values: true, specialties: true } } } } },
          orderBy: [{ sortOrder: "asc" }, { definitionId: "asc" }],
        },
      },
    }),
    prisma.measurementDefinition.findMany({ include: { specialties: { include: { specialty: { select: { name: true } } } } }, orderBy: { name: "asc" } }),
  ]);
  if (!specialty) notFound();
  const assigned = new Set(specialty.measurements.map((m) => m.definitionId));

  return (
    <section className="flex flex-col gap-4">
      <Link href="/admin/specialties" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        სპეციალობები
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{specialty.name} — მაჩვენებლები</h1>
        <p className="text-sm text-muted-foreground">
          ეს მაჩვენებლები გამოუჩნდება ამ სპეციალობის ექიმს ვიზიტის ფორმაში. რაოდენობა შეზღუდული არ არის; ცვლილება მოქმედებს ახალ და
          მიმდინარე ვიზიტებზე, ძველი მნიშვნელობები რჩება.
        </p>
      </div>
      <SpecialtyMeasurements
        specialtyId={specialty.id}
        showCommonVitals={specialty.showCommonVitals}
        rows={specialty.measurements.map((m) => ({
          ...toDef(m.definition, m.required),
          usedInVisits: m.definition._count.values,
          sharedWith: m.definition._count.specialties - 1,
        }))}
        catalog={catalog
          .filter((d) => !assigned.has(d.id))
          .map((d) => ({ id: d.id, label: d.name, detail: d.specialties.map((s) => s.specialty.name).join(", ") || "არცერთ სპეციალობაზე" }))}
      />
    </section>
  );
}
