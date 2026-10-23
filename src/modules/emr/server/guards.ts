import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isDocumentType } from "@/modules/emr/documents/templates";
import { EmrError } from "./errors";

type Db = Prisma.TransactionClient;

/**
 * ჩაკეტილი ჩანაწერის დაცვა — ყველა ცვლილება ამ შემოწმებებით გადის (სერვერზე, ტრანზაქციაში):
 * ვიზიტი იცვლება მხოლოდ მისი ექიმის მიერ და მხოლოდ დასრულებამდე; დოკუმენტი — მხოლოდ ავტორის მიერ და ხელმოწერამდე.
 */

/** საკუთარი, დაუსრულებელი ვიზიტი (დანიშნულებები, რეცეპტი). */
export async function ownDraftEncounter(tx: Db, encounterId: number, userId: number) {
  const e = await tx.encounter.findUnique({ where: { id: encounterId }, select: { doctorId: true, status: true, patientId: true } });
  if (!e) throw new EmrError("ვიზიტის ჩანაწერი ვერ მოიძებნა");
  if (e.doctorId !== userId) throw new EmrError("ეს ვიზიტი სხვა ექიმისაა — მხოლოდ სანახავად");
  if (e.status !== "draft") throw new EmrError("ვიზიტი დასრულებულია — ჩანაწერი ჩაკეტილია");
  return e;
}

/** დოკუმენტის დრაფტი: ჩაკეტვა (FOR UPDATE), ავტორი — მე, სტატუსი — დრაფტი. */
export async function lockOwnDraftDocument(tx: Db, documentId: number, userId: number) {
  await tx.$queryRaw`SELECT id FROM medical_documents WHERE id = ${documentId} FOR UPDATE`;
  const d = await tx.medicalDocument.findUnique({
    where: { id: documentId },
    select: { id: true, type: true, status: true, createdById: true, patientId: true, previousId: true, version: true, title: true },
  });
  if (!d || !isDocumentType(d.type)) throw new EmrError("დოკუმენტი ვერ მოიძებნა");
  if (d.createdById !== userId) throw new EmrError("დოკუმენტს ასწორებს მხოლოდ მისი ავტორი");
  if (d.status !== "draft") throw new EmrError("დოკუმენტი ხელმოწერილია და ჩაკეტილია — შექმენით ახალი ვერსია");
  return { ...d, type: d.type };
}
