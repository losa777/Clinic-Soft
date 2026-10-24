import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { recordHasRole, userWithRole } from "@/lib/user-roles";
import { scheduleSummary, timeOfDate } from "@/lib/doctor-schema";
import { type DoctorRow, DoctorsTable } from "./doctors-table";

export const instant = false;

export const metadata: Metadata = { title: "ექიმები" };

export default async function DoctorsPage() {
  await requireRole("admin");
  // „ექიმის“ როლის მომხმარებლები (მთავარი ან დამატებითი) და ისინიც, ვისაც პროფილი აქვს, მაგრამ როლი შეეცვალა
  const users = await prisma.user.findMany({
    where: { OR: [userWithRole({ code: "doctor" }), { doctorProfile: { isNot: null } }] },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      isActive: true,
      role: { select: { code: true } },
      extraRoles: { select: { role: { select: { code: true } } } },
      doctorProfile: {
        select: {
          visitDuration: true,
          room: true,
          isActive: true,
          specialty: { select: { name: true } },
          schedules: { select: { weekday: true, startTime: true, endTime: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rows: DoctorRow[] = users.map((u) => {
    const p = u.doctorProfile;
    return {
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`,
      username: u.username,
      specialty: p?.specialty.name ?? null,
      duration: p?.visitDuration ?? null,
      room: p?.room ?? null,
      schedule: p
        ? scheduleSummary(p.schedules.map((s) => ({ weekday: s.weekday, start: timeOfDate(s.startTime), end: timeOfDate(s.endTime) })))
        : "",
      status: !p ? "none" : !recordHasRole(u, "doctor") ? "not-doctor" : p.isActive && u.isActive ? "active" : "inactive",
    };
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">ექიმები</h1>
        <p className="text-sm text-muted-foreground">
          სპეციალობა, ვიზიტის ხანგრძლივობა, კაბინეტი და სამუშაო განრიგი. სიაში ჩანან „ექიმის“ როლის მომხმარებლები — ახალი ექიმი
          ჯერ „მომხმარებლებში“ დაამატეთ.
        </p>
      </div>
      <DoctorsTable data={rows} />
    </section>
  );
}
