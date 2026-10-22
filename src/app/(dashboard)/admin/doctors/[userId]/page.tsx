import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { timeOfDate } from "@/lib/doctor-schema";
import { DoctorForm } from "./doctor-form";

export const instant = false;

async function loadDoctorUser(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isActive: true,
      role: { select: { code: true } },
      doctorProfile: { include: { schedules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] } } },
    },
  });
  // ექიმის როლის მომხმარებელი ან ის, ვისაც პროფილი უკვე აქვს
  if (!user || (user.role.code !== "doctor" && !user.doctorProfile)) notFound();
  return user;
}

export async function generateMetadata({ params }: PageProps<"/admin/doctors/[userId]">): Promise<Metadata> {
  await requireRole("admin");
  const user = await loadDoctorUser((await params).userId);
  return { title: `${user.firstName} ${user.lastName}` };
}

export default async function DoctorPage({ params }: PageProps<"/admin/doctors/[userId]">) {
  await requireRole("admin");
  const user = await loadDoctorUser((await params).userId);
  const [specialties, services] = await Promise.all([
    prisma.specialty.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.service.findMany({
      where: { OR: [{ isActive: true }, { id: user.doctorProfile?.consultationServiceId ?? -1 }] },
      select: { id: true, code: true, name: true, price: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const p = user.doctorProfile;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link href="/admin/doctors" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          ექიმები
        </Link>
        <div>
          <h1 className="text-xl font-semibold">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">სპეციალობა, ვიზიტის პარამეტრები და კვირის სამუშაო განრიგი</p>
        </div>
      </div>
      <DoctorForm
        userId={user.id}
        roleIsDoctor={user.role.code === "doctor"}
        userActive={user.isActive}
        specialties={specialties}
        services={services.map((s) => ({
          id: s.id,
          label: s.code ? `${s.code} — ${s.name}` : s.name,
          detail: `${s.price.toFixed(2)} ₾`,
        }))}
        initial={{
          specialtyId: p?.specialtyId ?? null,
          consultationServiceId: p?.consultationServiceId ?? null,
          visitDuration: String(p?.visitDuration ?? 30),
          room: p?.room ?? "",
          isActive: p?.isActive ?? true,
          schedule: (p?.schedules ?? []).map((s) => ({ weekday: s.weekday, start: timeOfDate(s.startTime), end: timeOfDate(s.endTime) })),
        }}
      />
    </section>
  );
}
