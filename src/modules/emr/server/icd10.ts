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
