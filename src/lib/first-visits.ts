import "server-only";
import { prisma } from "@/lib/db";
import { addDays, isoWeekday, tbilisiToDate } from "@/lib/appointment-slots";
import type { FirstVisitStats } from "@/lib/first-visit-balance";
import { userWithRole } from "@/lib/user-roles";

/**
 * პირველადი პაციენტები დღის მიხედვით — რეგისტრატურის დაბალანსებისთვის (სპეციალობის შიგნით).
 * დღის ვიზიტი — ამ დღის ჯავშანი (ცოცხალი რიგის ჩათვლით), გაუქმებულისა და „არ გამოცხადდა“-ს გარეშე.
 * პირველადია, თუ პაციენტს ამ დღემდე ვიზიტი არ ჰქონია: არც ჯავშანი (იგივე სტატუსებით), არც ინვოისი (ძველი
 * „ვიზიტებიდან“ გადმოტანილიც). ინდექსები: idx_appointments_start, idx_appointments_patient, invoices(patient_id).
 * უფლებას გამომძახებელი ამოწმებს.
 */

const NOT_VISIT = ["cancelled", "no_show"] as const;

export async function loadFirstVisitStats(date: string): Promise<FirstVisitStats> {
  const from = tbilisiToDate(date, 0);
  const to = tbilisiToDate(addDays(date, 1), 0);
  const [counts, doctors] = await Promise.all([
    prisma.$queryRaw<{ doctor_id: number; total: bigint; first: unknown }[]>`
      SELECT a.doctor_id, COUNT(*) AS total,
        SUM(CASE WHEN NOT EXISTS (
              SELECT 1 FROM appointments p
              WHERE p.patient_id = a.patient_id AND p.start_time < ${from} AND p.status NOT IN ('cancelled', 'no_show')
            ) AND NOT EXISTS (
              SELECT 1 FROM invoices i
              WHERE i.patient_id = a.patient_id AND i.created_at < ${from} AND i.status <> 'cancelled'
            ) THEN 1 ELSE 0 END) AS first
      FROM appointments a
      WHERE a.start_time >= ${from} AND a.start_time < ${to} AND a.status NOT IN ('cancelled', 'no_show')
      GROUP BY a.doctor_id
    `,
    // მომუშავე ექიმები + ვისაც ამ დღეს ვიზიტი აქვს (მაგ. გრაფიკს გარეთ, ცოცხალი რიგით)
    prisma.doctor.findMany({
      where: {
        OR: [
          { isActive: true, user: { isActive: true, ...userWithRole({ code: "doctor" }) } },
          { appointments: { some: { startTime: { gte: from, lt: to }, status: { notIn: [...NOT_VISIT] } } } },
        ],
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        specialty: { select: { id: true, name: true } },
        schedules: { select: { weekday: true } },
      },
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
    }),
  ]);

  const byDoctor = new Map(counts.map((c) => [Number(c.doctor_id), { all: Number(c.total), first: Number(c.first ?? 0) }]));
  const weekday = isoWeekday(date);
  const specialties = new Map<number, FirstVisitStats["specialties"][number]>();
  for (const d of doctors) {
    const c = byDoctor.get(d.id) ?? { all: 0, first: 0 };
    const works = d.isActive && d.schedules.some((s) => s.weekday === weekday);
    // არც მუშაობს, არც ვიზიტი აქვს — სიაში არ ჩანს
    if (!works && !c.all) continue;
    const s = specialties.get(d.specialty.id) ?? { id: d.specialty.id, name: d.specialty.name, first: 0, doctors: [] };
    s.first += c.first;
    s.doctors.push({ doctorId: d.id, name: `${d.user.firstName} ${d.user.lastName}`, room: d.room, first: c.first, all: c.all, works });
    specialties.set(d.specialty.id, s);
  }
  const list = [...specialties.values()].sort((a, b) => a.name.localeCompare(b.name, "ka"));
  return {
    date,
    first: list.reduce((n, s) => n + s.first, 0),
    all: counts.reduce((n, c) => n + Number(c.total), 0),
    specialties: list,
  };
}

/** პაციენტი ამ დღისთვის პირველადია (ამ დღემდე ვიზიტი/ინვოისი არ ჰქონია) — იგივე წესით, რაც სტატისტიკაში. */
export async function isFirstVisitPatient(patientId: number, date: string): Promise<boolean> {
  const from = tbilisiToDate(date, 0);
  const [appointments, invoices] = await Promise.all([
    prisma.appointment.count({ where: { patientId, startTime: { lt: from }, status: { notIn: [...NOT_VISIT] } } }),
    prisma.invoice.count({ where: { patientId, createdAt: { lt: from }, status: { not: "cancelled" } } }),
  ]);
  return appointments === 0 && invoices === 0;
}
