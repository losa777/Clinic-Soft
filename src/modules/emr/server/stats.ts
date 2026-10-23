import "server-only";
import { addDays, tbilisiParts, tbilisiToDate } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";

/**
 * ექიმის სტატისტიკა პერიოდისთვის (თბილისის დღეები, მაქს. 366): ვიზიტები, პაციენტები, პირველადი/განმეორებითი,
 * საშუალო ხანგრძლივობა, არ გამოცხადდა, ხშირი დიაგნოზები, დანიშნულებები, დოკუმენტები, შემოსავალი.
 * ინდექსები: encounters(doctor_id, started_at), appointments(doctor_id, start_time), invoices(doctor_id).
 */
export async function loadDoctorStats({ userId, doctorId, from, to }: { userId: number; doctorId: number; from: string; to: string }) {
  const start = tbilisiToDate(from, 0);
  const end = tbilisiToDate(addDays(to, 1), 0);
  const range = { gte: start, lt: end };

  const [encounters, appointments, repeat, duration, diagnoses, orders, prescriptions, documents, revenue] = await Promise.all([
    prisma.encounter.findMany({ where: { doctorId: userId, startedAt: range }, select: { startedAt: true, status: true, patientId: true } }),
    prisma.appointment.groupBy({ by: ["status"], where: { doctorId, startTime: range }, _count: { _all: true } }),
    // განმეორებითი: პაციენტს ამ ვიზიტამდე კლინიკაში სხვა ვიზიტი ჰქონდა
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM encounters e
      WHERE e.doctor_id = ${userId} AND e.started_at >= ${start} AND e.started_at < ${end}
        AND EXISTS (SELECT 1 FROM encounters p WHERE p.patient_id = e.patient_id AND p.started_at < e.started_at)`,
    prisma.$queryRaw<{ minutes: number | null }[]>`
      SELECT AVG(TIMESTAMPDIFF(SECOND, started_at, completed_at)) / 60 AS minutes FROM encounters
      WHERE doctor_id = ${userId} AND status = 'completed' AND started_at >= ${start} AND started_at < ${end}`,
    prisma.$queryRaw<{ code: string; name: string; n: bigint }[]>`
      SELECT d.icd10_code AS code, c.name_ka AS name, COUNT(*) AS n
      FROM encounter_diagnoses d
      JOIN encounters e ON e.id = d.encounter_id
      JOIN icd10_codes c ON c.code = d.icd10_code
      WHERE e.doctor_id = ${userId} AND e.started_at >= ${start} AND e.started_at < ${end}
      GROUP BY d.icd10_code, c.name_ka ORDER BY n DESC, d.icd10_code LIMIT 10`,
    prisma.medicalOrder.groupBy({ by: ["type"], where: { createdById: userId, createdAt: range, status: { not: "cancelled" } }, _count: { _all: true } }),
    prisma.prescription.count({ where: { createdById: userId, createdAt: range } }),
    prisma.medicalDocument.count({ where: { createdById: userId, signedAt: range } }),
    prisma.invoice.aggregate({
      where: { doctorId: userId, createdAt: range, status: { not: "cancelled" } },
      _sum: { totalAmount: true, insuranceAmount: true, patientAmount: true },
      _count: { _all: true },
    }),
  ]);

  // დღეების მიხედვით (თბილისის დროით) — დასრულებული ვიზიტები
  const perDay = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) perDay.set(d, 0);
  for (const e of encounters) {
    if (e.status !== "completed") continue;
    const day = tbilisiParts(e.startedAt).date;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const byStatus = Object.fromEntries(appointments.map((a) => [a.status, a._count._all])) as Record<string, number>;
  const total = encounters.length;
  const repeatCount = Number(repeat[0]?.n ?? 0);

  return {
    visits: total,
    completed: encounters.filter((e) => e.status === "completed").length,
    open: encounters.filter((e) => e.status === "draft").length,
    patients: new Set(encounters.map((e) => e.patientId)).size,
    firstVisits: total - repeatCount,
    repeatVisits: repeatCount,
    avgMinutes: duration[0]?.minutes === null || duration[0]?.minutes === undefined ? null : Math.round(Number(duration[0].minutes)),
    noShow: byStatus.no_show ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    perDay: [...perDay.entries()].map(([date, count]) => ({ date, count })),
    diagnoses: diagnoses.map((d) => ({ code: d.code, name: d.name, count: Number(d.n) })),
    orders: Object.fromEntries(orders.map((o) => [o.type, o._count._all])) as Partial<Record<"lab" | "instrumental" | "procedure", number>>,
    prescriptions,
    documents,
    revenue: {
      invoices: revenue._count._all,
      total: revenue._sum.totalAmount?.toFixed(2) ?? "0.00",
      insurance: revenue._sum.insuranceAmount?.toFixed(2) ?? "0.00",
      patient: revenue._sum.patientAmount?.toFixed(2) ?? "0.00",
    },
  };
}

export type DoctorStats = Awaited<ReturnType<typeof loadDoctorStats>>;
