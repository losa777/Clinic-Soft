/**
 * ICD-10-ის იმპორტი CSV-დან icd10_codes ცხრილში. განმეორებით გაშვებისას არსებული კოდის დასახელება ახლდება.
 *
 * გაშვება:
 *   npm run icd10:import -- <ფაილი.csv> [--code=<სვეტი>] [--ka=<სვეტი>] [--en=<სვეტი>] [--delimiter=";"] [--dry-run]
 *
 * სვეტი — სათაური ან ნომერი 1-დან. ნაგულისხმევად სათაურით იცნობს: code/კოდი, name_ka/დასახელება, name_en.
 * ქართული დასახელება თუ არ არის, ინგლისური ჩაიწერება. ფაილი UTF-8 (BOM-ით ან მის გარეშე).
 * სატესტო ნიმუში: data/icd10-sample.csv (ქართული დასახელებები — არაოფიციალური, შეცვალეთ ოფიციალური ფაილით).
 */
import { readFileSync } from "node:fs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { type ColumnMap, mapRows, parseCsv, resolveColumns } from "@/modules/emr/icd10";

const BATCH = 500;

function parseArgs(argv: string[]) {
  const options: Record<string, string> = {};
  const files: string[] = [];
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (m) options[m[1]] = m[2] ?? "true";
    else files.push(arg);
  }
  return { file: files[0], options };
}

async function main() {
  const { file, options } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("მიუთითეთ ფაილი: npm run icd10:import -- data/icd10-sample.csv");
    process.exitCode = 1;
    return;
  }

  const delimiter = options.delimiter === "\\t" || options.delimiter === "tab" ? "\t" : options.delimiter;
  const [header, ...lines] = parseCsv(readFileSync(file, "utf8"), delimiter);
  if (!header) throw new Error("ფაილი ცარიელია");
  const columns: ColumnMap = resolveColumns(header, { code: options.code, ka: options.ka, en: options.en });
  const { rows, skipped, englishOnly } = mapRows(lines, columns);

  console.log(`ფაილი: ${file} — ხაზი: ${lines.length}, სწორი კოდი: ${rows.length}, გამოტოვებული: ${skipped.length}`);
  for (const s of skipped.slice(0, 10)) console.log(`  ხაზი ${s.line}: ${s.reason}`);
  if (skipped.length > 10) console.log(`  … და კიდევ ${skipped.length - 10}`);
  if (englishOnly) console.log(`  ქართული დასახელების გარეშე (ჩაიწერა ინგლისური): ${englishOnly}`);
  if (options["dry-run"]) {
    console.log("--dry-run: ბაზაში არაფერი ჩაწერილა");
    return;
  }

  // MySQL affected rows: 1 — ახალი, 2 — განახლებული, 0 — უცვლელი
  let affected = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((r) => Prisma.sql`(${r.code}, ${r.nameKa}, ${r.nameEn})`);
    affected += await prisma.$executeRaw`
      INSERT INTO icd10_codes (code, name_ka, name_en) VALUES ${Prisma.join(values)}
      ON DUPLICATE KEY UPDATE name_ka = VALUES(name_ka), name_en = VALUES(name_en)
    `;
  }
  const total = await prisma.icd10Code.count();
  console.log(`✔ იმპორტი დასრულდა (ჩაწერილი/განახლებული ხაზები: ${affected}). ბაზაში ICD-10 კოდი: ${total}`);
}

main()
  .catch((err) => {
    console.error("✖ ICD-10-ის იმპორტი ვერ მოხერხდა:");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
