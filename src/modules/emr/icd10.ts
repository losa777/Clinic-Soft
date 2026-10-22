/**
 * ICD-10: CSV-ის წაკითხვა და კოდის ნორმალიზაცია (სუფთა ფუნქციები — იმპორტის სკრიპტი და ტესტები).
 * კოდი ინახება წერტილით, დიდი ასოთი: "e119" → "E11.9", "I10" → "I10".
 */

/** RFC 4180 CSV: ბრჭყალები, "" ბრჭყალის შიგნით, ხაზის გადატანა ბრჭყალებში; BOM იშლება. delimiter — ავტომატურად (, ; ტაბი). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** პირველ ხაზში ყველაზე ხშირი გამყოფი (ბრჭყალებს გარეთ). */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";
}

const CODE_PATTERN = /^[A-Z]\d{2}(\.[0-9A-Z]{1,4})?$/;

/**
 * კოდის ნორმალიზაცია: დიდი ასო, ჰარების და ორმაგი კოდირების ნიშნების (*, †, +) მოშორება, წერტილის ჩასმა
 * ("A000" → "A00.0"). null — არასწორი კოდი.
 */
export function normalizeCode(raw: string): string | null {
  let code = raw.trim().toUpperCase().replace(/[\s*†+]/g, "").replace(/\.$/, "");
  if (/^[A-Z]\d{3,6}$/.test(code)) code = `${code.slice(0, 3)}.${code.slice(3)}`;
  return CODE_PATTERN.test(code) ? code : null;
}

export type Icd10Row = { code: string; nameKa: string; nameEn: string | null };

export type ColumnMap = { code: number; ka: number | null; en: number | null };

const HEADER_ALIASES = {
  code: ["code", "icd", "icd10", "icd-10", "კოდი"],
  ka: ["name_ka", "ka", "georgian", "დასახელება", "ქართული", "name"],
  en: ["name_en", "en", "english", "title", "ინგლისური"],
} as const;

/** სვეტების განსაზღვრა სათაურით (ან --code=/--ka=/--en= — სათაური ან ნომერი 1-დან). */
export function resolveColumns(header: string[], overrides: Partial<Record<keyof ColumnMap, string>> = {}): ColumnMap {
  const names = header.map((h) => h.trim().toLowerCase());
  const find = (key: keyof ColumnMap): number | null => {
    const override = overrides[key];
    if (override) {
      if (/^\d+$/.test(override)) return Number(override) - 1;
      const i = names.indexOf(override.trim().toLowerCase());
      if (i < 0) throw new Error(`სვეტი „${override}“ ვერ მოიძებნა. სათაურები: ${header.join(", ")}`);
      return i;
    }
    const i = names.findIndex((n) => (HEADER_ALIASES[key] as readonly string[]).includes(n));
    return i < 0 ? null : i;
  };
  const code = find("code");
  if (code === null) throw new Error(`კოდის სვეტი ვერ მოიძებნა (მიუთითეთ --code=). სათაურები: ${header.join(", ")}`);
  const ka = find("ka");
  const en = find("en");
  if (ka === null && en === null) throw new Error("დასახელების სვეტი ვერ მოიძებნა (მიუთითეთ --ka= ან --en=)");
  return { code, ka, en };
}

export type MapResult = { rows: Icd10Row[]; skipped: { line: number; reason: string }[]; englishOnly: number };

/**
 * ხაზები → ჩანაწერები. ქართული დასახელება თუ არ არის, გამოიყენება ინგლისური (englishOnly ითვლის).
 * დუბლიკატი კოდი — ბოლო იმარჯვებს. firstLine — ფაილის ხაზის ნომერი (შეცდომის შეტყობინებისთვის).
 */
export function mapRows(lines: string[][], columns: ColumnMap, firstLine = 2): MapResult {
  const byCode = new Map<string, Icd10Row>();
  const skipped: MapResult["skipped"] = [];
  let englishOnly = 0;
  const cell = (r: string[], i: number | null) => (i === null ? "" : (r[i] ?? "").trim().replace(/\s+/g, " "));

  lines.forEach((r, n) => {
    const line = firstLine + n;
    const code = normalizeCode(cell(r, columns.code));
    if (!code) return skipped.push({ line, reason: `არასწორი კოდი „${cell(r, columns.code)}“` });
    const en = cell(r, columns.en) || null;
    let ka = cell(r, columns.ka);
    if (!ka && en) {
      ka = en;
      englishOnly++;
    }
    if (!ka) return skipped.push({ line, reason: `${code}: დასახელება ცარიელია` });
    byCode.set(code, { code, nameKa: ka.slice(0, 500), nameEn: en?.slice(0, 500) ?? null });
  });
  return { rows: [...byCode.values()], skipped, englishOnly };
}
