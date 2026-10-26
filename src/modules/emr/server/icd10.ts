import "server-only";
import { prisma } from "@/lib/db";

export type Icd10Option = { code: string; nameKa: string; nameEn: string | null };

const LIMIT = 20;

/**
 * ICD-10 ძებნა: კოდის დასაწყისით (PRIMARY KEY-ით, მაგ. "I1", "e11.9") ან დასახელების ნაწილით (ქართული/ინგლისური).
 * კლასიფიკატორი ~14 000 ჩანაწერია — დასახელების LIKE '%…%' აქ სწრაფია; პაციენტების მილიონიან ცხრილს არ ეხება.
 */
export async function searchIcd10(raw: string): Promise<Icd10Option[]> {
  const q = raw.trim().slice(0, 100);
  if (!q) return [];
  const looksLikeCode = /^[A-Za-z]\d/.test(q);
  const rows = await prisma.icd10Code.findMany({
    where: looksLikeCode
      ? { code: { startsWith: q.toUpperCase().replace(/^([A-Z]\d{2})(\d)/, "$1.$2") } }
      : { OR: [{ nameKa: { contains: q } }, { nameEn: { contains: q } }] },
    orderBy: { code: "asc" },
    take: LIMIT,
  });
  return rows.map((r) => ({ code: r.code, nameKa: r.nameKa, nameEn: r.nameEn }));
}

/**
 * შეთავაზება ცარიელ ველზე (დაჭერისას): ექიმის ხშირად გამოყენებული დიაგნოზები (ბოლო 1000 ვიზიტიდან),
 * შემდეგ — კლინიკის ხშირად გამოყენებულები; ჯერ არაფერი თუ არ არის — კლასიფიკატორის პირველი კოდები.
 */
export async function suggestIcd10(doctorUserId: number): Promise<Icd10Option[]> {
  const usage = (rows: { code: string; n: bigint }[]) => rows.map((r) => r.code);
  const own = usage(
    await prisma.$queryRaw<{ code: string; n: bigint }[]>`
      SELECT d.icd10_code AS code, COUNT(*) AS n
      FROM (SELECT id FROM encounters WHERE doctor_id = ${doctorUserId} ORDER BY started_at DESC LIMIT 1000) e
      JOIN encounter_diagnoses d ON d.encounter_id = e.id
      GROUP BY d.icd10_code ORDER BY n DESC, d.icd10_code LIMIT ${LIMIT}`,
  );
  const codes = [...own];
  if (codes.length < LIMIT) {
    const clinic = usage(
      await prisma.$queryRaw<{ code: string; n: bigint }[]>`
        SELECT d.icd10_code AS code, COUNT(*) AS n
        FROM (SELECT icd10_code FROM encounter_diagnoses ORDER BY id DESC LIMIT 5000) d
        GROUP BY d.icd10_code ORDER BY n DESC, d.icd10_code LIMIT ${LIMIT}`,
    );
    for (const c of clinic) if (codes.length < LIMIT && !codes.includes(c)) codes.push(c);
  }
  if (!codes.length) {
    const first = await prisma.icd10Code.findMany({ orderBy: { code: "asc" }, take: LIMIT });
    return first.map((r) => ({ code: r.code, nameKa: r.nameKa, nameEn: r.nameEn }));
  }
  const rows = new Map((await prisma.icd10Code.findMany({ where: { code: { in: codes } } })).map((r) => [r.code, r]));
  return codes.flatMap((c) => {
    const r = rows.get(c);
    return r ? [{ code: r.code, nameKa: r.nameKa, nameEn: r.nameEn }] : [];
  });
}
