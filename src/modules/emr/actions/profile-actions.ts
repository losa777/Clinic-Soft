"use server";

import { type ActionResult, failure, invalid, success } from "@/lib/action-result";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import {
  type AllergyInput,
  allergySchema,
  type BloodGroupInput,
  bloodGroupSchema,
  type ConditionInput,
  conditionSchema,
  type MedicationInput,
  medicationSchema,
  type ProfileItemInput,
  profileItemSchema,
} from "@/modules/emr/schema";
import { audit } from "@/lib/audit";
import { searchIcd10, suggestIcd10 } from "@/modules/emr/server/icd10";

/**
 * სამედიცინო პროფილი (ალერგიები, ქრონიკული დაავადებები, მუდმივი მედიკამენტები, სისხლის ჯგუფი) — emr.edit.
 * პროფილი პაციენტისაა (არა ვიზიტის), ამიტომ ნებისმიერ ექიმს შეუძლია დამატება; ყველა ცვლილება აუდიტში იწერება.
 * ჩანაწერი არ იშლება — ითიშება (ისტორიისთვის).
 */

async function patientExists(patientId: number) {
  return (await prisma.patient.count({ where: { id: patientId } })) > 0;
}

export async function addAllergyAction(input: AllergyInput): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = allergySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await patientExists(parsed.data.patientId))) return failure("პაციენტი ვერ მოიძებნა");
  const userId = Number(me.id);
  await prisma.$transaction(async (tx) => {
    const a = await tx.patientAllergy.create({ data: { ...parsed.data, createdById: userId, createdAt: new Date() } });
    await audit({ userId, action: "create", entity: "allergy", entityId: a.id, patientId: a.patientId, details: a.substance }, tx);
  });
  return success(`ალერგია დაემატა: ${parsed.data.substance}`);
}

export async function addConditionAction(input: ConditionInput): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = conditionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { since, icd10Code, ...data } = parsed.data;
  if (!(await patientExists(data.patientId))) return failure("პაციენტი ვერ მოიძებნა");
  if (icd10Code && !(await prisma.icd10Code.count({ where: { code: icd10Code } }))) {
    return failure("შეასწორეთ მონიშნული ველები", { icd10Code: "ICD-10 კოდი ვერ მოიძებნა" });
  }
  const userId = Number(me.id);
  await prisma.$transaction(async (tx) => {
    const c = await tx.patientCondition.create({
      data: {
        ...data,
        icd10Code: icd10Code || null,
        since: since ? new Date(`${since}T00:00:00Z`) : null,
        createdById: userId,
        createdAt: new Date(),
      },
    });
    await audit({ userId, action: "create", entity: "condition", entityId: c.id, patientId: c.patientId, details: c.name }, tx);
  });
  return success("ქრონიკული დაავადება დაემატა");
}

export async function addMedicationAction(input: MedicationInput): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = medicationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await patientExists(parsed.data.patientId))) return failure("პაციენტი ვერ მოიძებნა");
  const userId = Number(me.id);
  await prisma.$transaction(async (tx) => {
    const m = await tx.patientMedication.create({ data: { ...parsed.data, createdById: userId, createdAt: new Date() } });
    await audit({ userId, action: "create", entity: "medication", entityId: m.id, patientId: m.patientId, details: m.drugName }, tx);
  });
  return success("მედიკამენტი დაემატა");
}

export async function deactivateProfileItemAction(input: ProfileItemInput): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = profileItemSchema.safeParse(input);
  if (!parsed.success) return failure("ჩანაწერი ვერ მოიძებნა");
  const { kind, id } = parsed.data;
  const userId = Number(me.id);

  const patientId = await prisma.$transaction(async (tx) => {
    const where = { id, isActive: true };
    const data = { isActive: false };
    const item =
      kind === "allergy"
        ? await tx.patientAllergy.findFirst({ where, select: { patientId: true } })
        : kind === "condition"
          ? await tx.patientCondition.findFirst({ where, select: { patientId: true } })
          : await tx.patientMedication.findFirst({ where, select: { patientId: true } });
    if (!item) return null;
    if (kind === "allergy") await tx.patientAllergy.update({ where: { id }, data });
    else if (kind === "condition") await tx.patientCondition.update({ where: { id }, data });
    else await tx.patientMedication.update({ where: { id }, data });
    await audit({ userId, action: "deactivate", entity: kind, entityId: id, patientId: item.patientId }, tx);
    return item.patientId;
  });
  return patientId ? success("ჩანაწერი მოიხსნა (ისტორიაში რჩება)") : failure("ჩანაწერი ვერ მოიძებნა ან უკვე მოხსნილია");
}

export async function setBloodGroupAction(input: BloodGroupInput): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  const parsed = bloodGroupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const userId = Number(me.id);
  const { patientId, bloodGroup } = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.patient.updateMany({ where: { id: patientId }, data: { bloodGroup } });
    if (count) await audit({ userId, action: "update", entity: "blood_group", patientId, details: bloodGroup ?? "—" }, tx);
    return count;
  });
  return updated ? success(`სისხლის ჯგუფი: ${bloodGroup ?? "არ არის მითითებული"}`) : failure("პაციენტი ვერ მოიძებნა");
}

/** ICD-10 ძებნა კოდით ან დასახელებით (მაქს. 20) — დიაგნოზისა და ქრონიკული დაავადებისთვის. */
/** ICD-10 ძებნა; ცარიელი ტექსტი (ველზე დაჭერისას) — ექიმის/კლინიკის ხშირად გამოყენებული დიაგნოზები. */
export async function searchIcd10Action(query: string) {
  const me = await requirePermission("emr.view");
  if (typeof query !== "string") return [];
  return query.trim() ? searchIcd10(query) : suggestIcd10(Number(me.id));
}
