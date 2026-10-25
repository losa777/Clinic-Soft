import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { BOOLEAN_LABELS, sidesOf } from "@/modules/emr/measurements";

type Db = Prisma.TransactionClient;

/**
 * სპეციალობის მაჩვენებლები (ადმინის დამატებული) ექსპორტისთვის: encounterId → ყველა ერთ ტექსტად, თითო ხაზზე
 * („თვალშიდა წნევა (T) OD: 11.0 მმ Hg“). Excel-ის უჯრაში ხაზები გადატანით ჩანს.
 */
export async function loadMeasurementsText(db: Db, encounterIds: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!encounterIds.length) return result;
  const rows = await db.encounterMeasurement.findMany({
    where: { encounterId: { in: encounterIds } },
    include: { definition: { select: { name: true, unit: true, type: true, decimals: true, sides: true } } },
    orderBy: [{ encounterId: "asc" }, { definitionId: "asc" }, { side: "asc" }],
  });
  for (const r of rows) {
    const d = r.definition;
    const value =
      d.type === "number"
        ? r.valueNum === null
          ? ""
          : `${r.valueNum.toNumber().toFixed(d.decimals)}${d.unit ? ` ${d.unit}` : ""}`
        : d.type === "boolean"
          ? (BOOLEAN_LABELS[r.valueText as "yes" | "no"] ?? r.valueText ?? "")
          : (r.valueText ?? "");
    if (!value) continue;
    const side = sidesOf(d.sides).find((s) => s.side === r.side)?.label;
    const line = `${d.name}${side ? ` ${side}` : ""}: ${value}`;
    const text = result.get(r.encounterId);
    result.set(r.encounterId, text ? `${text}\n${line}` : line);
  }
  return result;
}
