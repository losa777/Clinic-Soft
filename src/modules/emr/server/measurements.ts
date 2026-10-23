import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  formatMeasurement,
  MEASUREMENT_KEY,
  type MeasurementDef,
  measurementKey,
  parseMeasurement,
  rawOf,
  type SideCode,
  sidesOf,
} from "@/modules/emr/measurements";
import { EmrError } from "./errors";

type Db = Prisma.TransactionClient;

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

type DefinitionRow = Prisma.MeasurementDefinitionGetPayload<object>;

export function toDef(d: DefinitionRow, required = false): MeasurementDef {
  let options: string[] = [];
  try {
    options = d.options ? (JSON.parse(d.options) as string[]) : [];
  } catch {
    options = [];
  }
  return {
    id: d.id,
    name: d.name,
    unit: d.unit,
    type: d.type,
    sides: d.sides,
    min: num(d.minValue),
    max: num(d.maxValue),
    normalMin: num(d.normalMin),
    normalMax: num(d.normalMax),
    decimals: d.decimals,
    options,
    required,
  };
}

/** ვიზიტის სპეციალობა: მიღების დაწყებისას ჩაწერილი, ან (ძველ ვიზიტზე) ექიმის მიმდინარე. */
async function encounterSpecialty(db: Db, encounterId: number) {
  const e = await db.encounter.findUnique({
    where: { id: encounterId },
    select: { specialtyId: true, doctor: { select: { doctorProfile: { select: { specialtyId: true } } } } },
  });
  return e ? (e.specialtyId ?? e.doctor.doctorProfile?.specialtyId ?? null) : null;
}

/**
 * ვიზიტის ფორმის მაჩვენებლები: სპეციალობის ნაკრები (რიგით) + ის, რასაც ამ ვიზიტზე მნიშვნელობა უკვე აქვს
 * (თუ ადმინმა მაჩვენებელი სპეციალობიდან მოხსნა — ძველი მნიშვნელობა მაინც ჩანს). values — ფორმის ტექსტები გასაღებით.
 */
export async function loadEncounterMeasurements(db: Db, encounterId: number) {
  const specialtyId = await encounterSpecialty(db, encounterId);
  const [specialty, assigned, stored] = await Promise.all([
    specialtyId ? db.specialty.findUnique({ where: { id: specialtyId }, select: { showCommonVitals: true } }) : null,
    specialtyId
      ? db.specialtyMeasurement.findMany({ where: { specialtyId }, include: { definition: true }, orderBy: [{ sortOrder: "asc" }, { definitionId: "asc" }] })
      : [],
    db.encounterMeasurement.findMany({ where: { encounterId }, include: { definition: true } }),
  ]);
  const defs = assigned.map((a) => toDef(a.definition, a.required));
  for (const s of stored) if (!defs.some((d) => d.id === s.definitionId)) defs.push(toDef(s.definition));
  const values: Record<string, string> = {};
  for (const s of stored) {
    values[measurementKey(s.definitionId, s.side)] = rawOf(toDef(s.definition), { num: num(s.valueNum), text: s.valueText });
  }
  return { defs, values, showCommonVitals: specialty?.showCommonVitals ?? true };
}

/**
 * მნიშვნელობების შენახვა (ვიზიტის ავტოშენახვისას, ტრანზაქციაში): მხოლოდ ამ ვიზიტის მაჩვენებლები, ყოველი — თავისი
 * ტიპისა და ფარგლების შემოწმებით. შეცდომისას — EmrError ველების შეცდომებით (გასაღები: "m:<id>:<side>").
 */
export async function saveEncounterMeasurements(db: Db, encounterId: number, patientId: number, raw: Record<string, string>) {
  const { defs } = await loadEncounterMeasurements(db, encounterId);
  const byId = new Map(defs.map((d) => [d.id, d]));
  const errors: Record<string, string> = {};
  const rows: Prisma.EncounterMeasurementCreateManyInput[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const m = MEASUREMENT_KEY.exec(key);
    const def = m ? byId.get(Number(m[1])) : undefined;
    const side = m?.[2] as SideCode | undefined;
    if (!def || !side || !sidesOf(def.sides).some((s) => s.side === side)) continue; // სხვა სპეციალობის/უცნობი — იგნორი
    const parsed = parseMeasurement(def, value);
    if (!parsed.ok) errors[`m:${key}`] = `${def.name}: ${parsed.error}`;
    else if (parsed.value) rows.push({ encounterId, patientId, definitionId: def.id, side, valueNum: parsed.value.num, valueText: parsed.value.text });
  }
  if (Object.keys(errors).length) throw new EmrError(Object.values(errors)[0], errors);
  await db.encounterMeasurement.deleteMany({ where: { encounterId } });
  if (rows.length) await db.encounterMeasurement.createMany({ data: rows });
}

/** სავალდებულო, მაგრამ შეუვსებელი მაჩვენებლები (ვიზიტის დასრულებისას). */
export async function missingRequiredMeasurements(db: Db, encounterId: number): Promise<string[]> {
  const { defs, values } = await loadEncounterMeasurements(db, encounterId);
  return defs
    .filter((d) => d.required && sidesOf(d.sides).some((s) => !values[measurementKey(d.id, s.side)]))
    .map((d) => d.name);
}

/** ვიზიტების მაჩვენებლები ტექსტად (ისტორია, დოკუმენტები): encounterId → ["თვალშიდა წნევა (T) OD: 15.0 მმ Hg", ...]. */
export async function formatMeasurementsOf(db: Db, encounterIds: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  if (!encounterIds.length) return result;
  const rows = await db.encounterMeasurement.findMany({
    where: { encounterId: { in: encounterIds } },
    include: { definition: true },
    orderBy: [{ encounterId: "asc" }, { definitionId: "asc" }, { side: "asc" }],
  });
  for (const r of rows) {
    const line = formatMeasurement(toDef(r.definition), r.side, { num: num(r.valueNum), text: r.valueText });
    result.set(r.encounterId, [...(result.get(r.encounterId) ?? []), line]);
  }
  return result;
}
