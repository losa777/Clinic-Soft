"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, failure, invalid, isUniqueViolation, success } from "@/lib/action-result";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { type DefinitionInput, definitionSchema } from "@/modules/emr/measurements";

/**
 * სპეციალობის მაჩვენებლები (მხოლოდ ადმინი): ცნობარში შექმნა/რედაქტირება, სპეციალობაზე მინიჭება/მოხსნა, რიგი,
 * სავალდებულოობა, საერთო ვიტალურის ჩვენება. მაჩვენებლების რაოდენობა შეზღუდული არ არის.
 * მოხსნა ძველ ვიზიტებს არ ეხება — მნიშვნელობები რჩება და ჩანს.
 */

const id = z.number().int().positive();
const pair = z.object({ specialtyId: id, definitionId: id });
const path = (specialtyId: number) => `/admin/specialties/${specialtyId}`;
const NAME_TAKEN = { name: "ასეთი მაჩვენებელი უკვე არსებობს — დაამატეთ კატალოგიდან" };

/** ახალი მაჩვენებელი (specialtyId — იქვე მიენიჭება სიის ბოლოს) ან არსებულის რედაქტირება (id). */
export async function saveDefinitionAction(input: { id?: number; specialtyId?: number; values: DefinitionInput }): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = definitionSchema.safeParse(input.values);
  if (!parsed.success) return invalid(parsed.error);
  if (input.id !== undefined && !id.safeParse(input.id).success) return failure("მაჩვენებელი ვერ მოიძებნა");
  if (input.specialtyId !== undefined && !id.safeParse(input.specialtyId).success) return failure("სპეციალობა ვერ მოიძებნა");
  const v = parsed.data;
  const now = new Date();
  const data = {
    name: v.name,
    unit: v.unit,
    type: v.type,
    sides: v.sides,
    // რიცხვითი შეზღუდვები მხოლოდ რიცხვზე; ვარიანტები — მხოლოდ არჩევანზე
    minValue: v.type === "number" ? v.min : null,
    maxValue: v.type === "number" ? v.max : null,
    normalMin: v.type === "number" ? v.normalMin : null,
    normalMax: v.type === "number" ? v.normalMax : null,
    decimals: v.type === "number" ? v.decimals : 0,
    options: v.type === "select" ? JSON.stringify(v.options) : null,
    updatedAt: now,
  };

  try {
    await prisma.$transaction(async (tx) => {
      if (input.id) {
        const current = await tx.measurementDefinition.findUnique({ where: { id: input.id }, include: { _count: { select: { values: true } } } });
        if (!current) throw new Error("NOT_FOUND");
        // შენახული მნიშვნელობების ტიპი/მხარეები აღარ იცვლება — სხვაგვარად ძველი ვიზიტები ვეღარ წაიკითხება
        if (current._count.values > 0 && (current.type !== v.type || current.sides !== v.sides)) throw new Error("IN_USE");
        await tx.measurementDefinition.update({ where: { id: input.id }, data });
      } else {
        const def = await tx.measurementDefinition.create({ data: { ...data, createdAt: now }, select: { id: true } });
        if (input.specialtyId) {
          const last = await tx.specialtyMeasurement.aggregate({ where: { specialtyId: input.specialtyId }, _max: { sortOrder: true } });
          await tx.specialtyMeasurement.create({
            data: { specialtyId: input.specialtyId, definitionId: def.id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
          });
        }
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("მაჩვენებელი უკვე არსებობს", NAME_TAKEN);
    if (error instanceof Error && error.message === "NOT_FOUND") return failure("მაჩვენებელი ვერ მოიძებნა");
    if (error instanceof Error && error.message === "IN_USE") {
      return failure("მაჩვენებელს ვიზიტებში უკვე აქვს მნიშვნელობები — ტიპს და მხარეებს ვეღარ შეცვლით (შექმენით ახალი)");
    }
    throw error;
  }
  if (input.specialtyId) revalidatePath(path(input.specialtyId));
  return success(input.id ? `მაჩვენებელი „${v.name}“ შეიცვალა` : `მაჩვენებელი „${v.name}“ დაემატა`);
}

/** კატალოგიდან მინიჭება (სიის ბოლოს). */
export async function assignMeasurementAction(input: z.input<typeof pair>): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = pair.safeParse(input);
  if (!parsed.success) return failure("მაჩვენებელი ვერ მოიძებნა");
  const { specialtyId, definitionId } = parsed.data;
  try {
    const last = await prisma.specialtyMeasurement.aggregate({ where: { specialtyId }, _max: { sortOrder: true } });
    await prisma.specialtyMeasurement.create({ data: { specialtyId, definitionId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("მაჩვენებელი უკვე დამატებულია");
    throw error;
  }
  revalidatePath(path(specialtyId));
  return success("მაჩვენებელი დაემატა");
}

/** სპეციალობიდან მოხსნა (ცნობარში და ძველ ვიზიტებში რჩება). */
export async function unassignMeasurementAction(input: z.input<typeof pair>): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = pair.safeParse(input);
  if (!parsed.success) return failure("მაჩვენებელი ვერ მოიძებნა");
  await prisma.specialtyMeasurement.deleteMany({ where: parsed.data });
  revalidatePath(path(parsed.data.specialtyId));
  return success("მაჩვენებელი მოიხსნა — ძველ ვიზიტებში მნიშვნელობები რჩება");
}

const moveSchema = pair.extend({ direction: z.enum(["up", "down"]) });

/** რიგის შეცვლა: მეზობელთან ადგილის გაცვლა (რიგი ჯერ 0..n-ზე ნორმალიზდება). */
export async function moveMeasurementAction(input: z.input<typeof moveSchema>): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return failure("მაჩვენებელი ვერ მოიძებნა");
  const { specialtyId, definitionId, direction } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT specialty_id FROM specialty_measurements WHERE specialty_id = ${specialtyId} FOR UPDATE`;
    const rows = await tx.specialtyMeasurement.findMany({ where: { specialtyId }, orderBy: [{ sortOrder: "asc" }, { definitionId: "asc" }] });
    const i = rows.findIndex((r) => r.definitionId === definitionId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (const [order, r] of rows.entries()) {
      if (r.sortOrder !== order) {
        await tx.specialtyMeasurement.update({ where: { specialtyId_definitionId: { specialtyId, definitionId: r.definitionId } }, data: { sortOrder: order } });
      }
    }
  });
  revalidatePath(path(specialtyId));
  return success("რიგი შეიცვალა");
}

const requiredSchema = pair.extend({ required: z.boolean() });

export async function setMeasurementRequiredAction(input: z.input<typeof requiredSchema>): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = requiredSchema.safeParse(input);
  if (!parsed.success) return failure("მაჩვენებელი ვერ მოიძებნა");
  const { required, ...where } = parsed.data;
  await prisma.specialtyMeasurement.updateMany({ where, data: { required } });
  revalidatePath(path(where.specialtyId));
  return success(required ? "სავალდებულოა (ვიზიტის დასრულებისას მოწმდება)" : "აღარ არის სავალდებულო");
}

const vitalsSchema = z.object({ specialtyId: id, show: z.boolean() });

/** საერთო ვიტალური (წნევა, პულსი...) ამ სპეციალობის ვიზიტის ფორმაში ჩანს თუ არა. */
export async function setShowCommonVitalsAction(input: z.input<typeof vitalsSchema>): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = vitalsSchema.safeParse(input);
  if (!parsed.success) return failure("სპეციალობა ვერ მოიძებნა");
  await prisma.specialty.updateMany({ where: { id: parsed.data.specialtyId }, data: { showCommonVitals: parsed.data.show } });
  revalidatePath(path(parsed.data.specialtyId));
  return success(parsed.data.show ? "საერთო ვიტალური ჩანს" : "საერთო ვიტალური დამალულია");
}
