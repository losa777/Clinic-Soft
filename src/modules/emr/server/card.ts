import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { tbilisiToday } from "@/lib/appointment-slots";
import { nextSequenceValue } from "@/modules/finance/server/numbering";

/** სამედიცინო ბარათის ნომერი ჩვენებისთვის: 6914/2026. */
export const formatCardNumber = (p: { cardNumber: number | null; cardYear: number | null }) =>
  p.cardNumber && p.cardYear ? `${p.cardNumber}/${p.cardYear}` : null;

/**
 * სამედიცინო ბარათი წლის მიხედვით: პაციენტს მიმდინარე წლის ნომერი თუ ჯერ არ აქვს — ენიჭება შემდეგი (CARD მრიცხველი,
 * ბოლო ნომერი — „ადმინი → რეკვიზიტები“). გამოიძახეთ ტრანზაქციაში (მიღების დაწყებისას).
 */
export async function ensureCardNumber(tx: Prisma.TransactionClient, patientId: number): Promise<string> {
  const year = Number(tbilisiToday().slice(0, 4));
  await tx.$queryRaw`SELECT id FROM patients WHERE id = ${patientId} FOR UPDATE`;
  const p = await tx.patient.findUniqueOrThrow({ where: { id: patientId }, select: { cardNumber: true, cardYear: true } });
  if (p.cardYear === year && p.cardNumber) return formatCardNumber(p)!;
  const cardNumber = await nextSequenceValue(tx, "CARD", year);
  await tx.patient.update({ where: { id: patientId }, data: { cardNumber, cardYear: year } });
  return `${cardNumber}/${year}`;
}
