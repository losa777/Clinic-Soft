import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { PatientRecord } from "@/lib/patient-schema";

/**
 * პაციენტის წაკითხვა და ძებნა სერვერზე (გვერდებისა და Server Actions-ისთვის).
 * აქ როლი არ მოწმდება — გამომძახებელი ამოწმებს (requireRole / requireAnyRole).
 */

const dateTimeFormat = new Intl.DateTimeFormat("ka-GE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tbilisi",
});

const dateFormat = new Intl.DateTimeFormat("ka-GE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

const userName = { select: { firstName: true, lastName: true } } as const;
const fullName = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : null);

export async function loadPatientRecord(where: Prisma.PatientWhereUniqueInput): Promise<PatientRecord | null> {
  const p = await prisma.patient.findUnique({
    where,
    include: {
      createdBy: userName,
      updatedBy: userName,
      documents: { orderBy: { id: "asc" }, include: { uploadedBy: userName } },
    },
  });
  if (!p) return null;

  return {
    id: p.id,
    values: {
      personalId: p.personalId,
      firstName: p.firstName,
      lastName: p.lastName,
      fatherName: p.fatherName ?? "",
      firstNameEn: p.firstNameEn,
      lastNameEn: p.lastNameEn,
      birthDate: p.birthDate.toISOString().slice(0, 10),
      gender: p.gender,
      maritalStatus: p.maritalStatus ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      country: p.country ?? "",
      city: p.city ?? "",
      actualAddress: p.actualAddress ?? "",
      legalAddress: p.legalAddress ?? "",
      workplace: p.workplace ?? "",
      position: p.position ?? "",
      education: p.education ?? "",
      comment: p.comment ?? "",
    },
    documents: p.documents.map((d) => ({
      id: d.id,
      docType: d.docType,
      title: d.title,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      uploadedAt: dateTimeFormat.format(d.uploadedAt),
      uploadedBy: fullName(d.uploadedBy),
    })),
    createdAt: dateTimeFormat.format(p.createdAt),
    createdBy: fullName(p.createdBy),
    updatedAt: dateTimeFormat.format(p.updatedAt),
    updatedBy: fullName(p.updatedBy),
  };
}

export type PatientSearchRow = {
  id: number;
  personalId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string;
};

export type PatientSearchResult =
  | { status: "empty" }
  | { status: "invalid"; error: string }
  | { status: "ok"; kind: "personalId" | "name"; rows: PatientSearchRow[]; hasMore: boolean };

export const SEARCH_LIMIT = 20;

/** LIKE-ის სპეციალური სიმბოლოები სიტყვიდან ამოიღება (ძებნა მხოლოდ სიტყვის დასაწყისით). */
const cleanWord = (w: string) => w.replace(/[%_\\]/g, "");

/** ლათინური ასოებით შეყვანისას იძებნება First Name / Last Name ველებში. */
const isLatin = (w: string) => /[a-z]/i.test(w);

function nameCondition(first: string, last: string): Prisma.PatientWhereInput {
  const latin = isLatin(first) || isLatin(last);
  return latin
    ? { firstNameEn: { startsWith: first }, lastNameEn: { startsWith: last } }
    : { firstName: { startsWith: first }, lastName: { startsWith: last } };
}

/**
 * ძებნა პირადი ნომრით (სრულით ან დასაწყისით) ან სახელით/გვარით.
 * ყველა პირობა სიტყვის დასაწყისით (LIKE 'x%') იძებნება, ამიტომ მილიონობით ჩანაწერზეც ინდექსს იყენებს:
 * uq_patients_personal_id, idx_patients_name (last_name, first_name), idx_patients_first_name და ლათინური ანალოგები.
 */
export async function searchPatients(query: string): Promise<PatientSearchResult> {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return { status: "empty" };

  let where: Prisma.PatientWhereInput;
  let kind: "personalId" | "name";

  if (/^\d+$/.test(q)) {
    if (q.length < 4) return { status: "invalid", error: "პირადი ნომრით საძიებლად შეიყვანეთ მინიმუმ 4 ციფრი" };
    if (q.length > 11) return { status: "invalid", error: "პირადი ნომერი 11 ციფრისგან შედგება" };
    kind = "personalId";
    where = q.length === 11 ? { personalId: q } : { personalId: { startsWith: q } };
  } else {
    const words = q.split(" ").map(cleanWord).filter(Boolean);
    if (!words.length || words.join("").length < 2) {
      return { status: "invalid", error: "შეიყვანეთ მინიმუმ 2 ასო" };
    }
    if (words.length > 3 || words.some((w) => /\d/.test(w))) {
      return { status: "invalid", error: "მოძებნეთ სახელით და გვარით, ან მხოლოდ პირადი ნომრით" };
    }
    kind = "name";
    if (words.length === 1) {
      const [w] = words;
      where = isLatin(w)
        ? { OR: [{ lastNameEn: { startsWith: w } }, { firstNameEn: { startsWith: w } }] }
        : { OR: [{ lastName: { startsWith: w } }, { firstName: { startsWith: w } }] };
    } else {
      // „ნინო ბერიძე“ ან „ბერიძე ნინო“; სამი სიტყვისას ორმაგი სახელი/გვარი („ანა მარია ბერიძე“)
      const a = words.slice(0, -1).join(" ");
      const b = words.slice(1).join(" ");
      const first = words[0];
      const last = words.at(-1)!;
      where = { OR: [nameCondition(a, last), nameCondition(first, b), nameCondition(last, first)] };
    }
  }

  const found = await prisma.patient.findMany({
    where,
    select: { id: true, personalId: true, firstName: true, lastName: true, phone: true, birthDate: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: SEARCH_LIMIT + 1,
  });

  return {
    status: "ok",
    kind,
    hasMore: found.length > SEARCH_LIMIT,
    rows: found.slice(0, SEARCH_LIMIT).map((p) => ({ ...p, birthDate: dateFormat.format(p.birthDate) })),
  };
}
