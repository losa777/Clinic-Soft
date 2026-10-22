import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { type SpecialtyRow, SpecialtiesTable } from "./specialties-table";

export const instant = false;

export const metadata: Metadata = { title: "სპეციალობები" };

export default async function SpecialtiesPage() {
  await requireRole("admin");
  const specialties = await prisma.specialty.findMany({
    include: { _count: { select: { doctors: true } } },
    orderBy: { name: "asc" },
  });

  const rows: SpecialtyRow[] = specialties.map((s) => ({ id: s.id, name: s.name, doctors: s._count.doctors }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">სპეციალობები</h1>
        <p className="text-sm text-muted-foreground">ექიმების სპეციალობები (თერაპევტი, კარდიოლოგი...), რომლითაც ხდება ვიზიტის დაჯავშნა</p>
      </div>
      <SpecialtiesTable data={rows} />
    </section>
  );
}
