/**
 * PDF-ის ტექსტის აწყობა (pdf-lib): ქართული ფონტები @fontsource-დან (OFL) — sans (Noto Sans Georgian) ან serif
 * (Noto Serif Georgian, ფორმა 100). ქართული, ლათინური, ციფრები ცალ-ცალკე ფაილებშია, ამიტომ ტექსტი სიმბოლოების მიხედვით
 * ნაწილდება იმ ფონტზე, რომელსაც ეს სიმბოლო აქვს. ფონტში არარსებული სიმბოლო (ემოჯი და სხვ.) იცვლება მსგავსით ან „•“-ით.
 * დამოკიდებულება მხოლოდ pdf-lib-ზე და ფაილურ სისტემაზე (ტესტებიდანაც გამოიძახება).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

export type FontFamily = "sans" | "serif";
export type Weight = 400 | 700;
type Coverage = { hasGlyphForCodePoint(cp: number): boolean };

const FONTSOURCE = path.join(process.cwd(), "node_modules", "@fontsource");
const file = (pkg: string, subset: string, w: Weight) => path.join(FONTSOURCE, pkg, "files", `${pkg}-${subset}-${w}-normal.woff`);

/** ფონტების რიგი: პირველი, რომელსაც სიმბოლო აქვს. serif-ს სიმბოლოების ფაილი არ აქვს — sans-იდან. */
const FONT_SETS: Record<FontFamily, (w: Weight) => string[]> = {
  sans: (w) => ["georgian", "latin", "latin-ext", "symbols"].map((s) => file("noto-sans-georgian", s, w)),
  serif: (w) => [...["georgian", "latin", "latin-ext"].map((s) => file("noto-serif-georgian", s, w)), file("noto-sans-georgian", "symbols", w)],
};

type LoadedFonts = { bytes: Record<Weight, Uint8Array[]>; coverage: Record<Weight, Coverage[]> };
const cache = new Map<FontFamily, Promise<LoadedFonts>>();

/** ფონტის ფაილები (ერთხელ იკითხება პროცესში). */
function loadFonts(family: FontFamily): Promise<LoadedFonts> {
  let p = cache.get(family);
  if (!p) {
    p = (async () => {
      const read = async (w: Weight) => (await Promise.all(FONT_SETS[family](w).map((f) => readFile(f)))).map((b) => new Uint8Array(b));
      const [regular, bold] = await Promise.all([read(400), read(700)]);
      const cover = (list: Uint8Array[]) => list.map((b) => fontkit.create(b) as unknown as Coverage);
      return { bytes: { 400: regular, 700: bold }, coverage: { 400: cover(regular), 700: cover(bold) } };
    })();
    p.catch(() => cache.delete(family));
    cache.set(family, p);
  }
  return p;
}

/** ფონტში არარსებული სიმბოლოების ჩანაცვლება (ემოჯიები რეკომენდაციებში და სხვ.). */
const SUBSTITUTES: Record<string, string> = {
  "№": "N",
  "❌": "×",
  "✖": "×",
  "✗": "×",
  "✘": "×",
  "✕": "×",
  "✅": "✓",
  "✔": "✓",
  "☑": "✓",
  "⚠": "!",
  "➡": "→",
  "➤": "→",
};
/** უხილავი ნაწილები (variation selector, ZWJ, კანის ფერი) — იშლება. */
const INVISIBLE = /[︎️‍]|\uD83C[\uDFFB-\uDFFF]/g;

export const INK = rgb(0.1, 0.1, 0.1);
export const MUTED = rgb(0.4, 0.4, 0.4);

export class Typesetter {
  private fonts: Record<Weight, PDFFont[]>;
  private coverage: Record<Weight, Coverage[]>;

  constructor(fonts: Record<Weight, PDFFont[]>, coverage: Record<Weight, Coverage[]>) {
    this.fonts = fonts;
    this.coverage = coverage;
  }

  private fontIndex(ch: string, weight: Weight) {
    const cp = ch.codePointAt(0)!;
    return this.coverage[weight].findIndex((c) => c.hasGlyphForCodePoint(cp));
  }

  private runs(text: string, weight: Weight): { font: PDFFont; text: string }[] {
    const result: { font: PDFFont; text: string }[] = [];
    for (let ch of text.replace(INVISIBLE, "")) {
      let i = this.fontIndex(ch, weight);
      if (i < 0) {
        const sub = SUBSTITUTES[ch];
        ch = sub && this.fontIndex(sub, weight) >= 0 ? sub : "•";
        i = Math.max(0, this.fontIndex(ch, weight));
      }
      const font = this.fonts[weight][i];
      const last = result.at(-1);
      if (last && last.font === font) last.text += ch;
      else result.push({ font, text: ch });
    }
    return result;
  }

  width(text: string, size: number, weight: Weight = 400) {
    return this.runs(text, weight).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
  }

  draw(page: PDFPage, text: string, x: number, y: number, size: number, weight: Weight = 400, color = INK, opacity = 1) {
    for (const r of this.runs(text, weight)) {
      page.drawText(r.text, { x, y, size, font: r.font, color, opacity });
      x += r.font.widthOfTextAtSize(r.text, size);
    }
  }

  /** გახაზული ტექსტი (ფორმა 100-ის პუნქტების სათაურები). */
  drawUnderlined(page: PDFPage, text: string, x: number, y: number, size: number, weight: Weight = 700) {
    this.draw(page, text, x, y, size, weight);
    if (text.trim()) page.drawLine({ start: { x, y: y - 1.6 }, end: { x: x + this.width(text, size, weight), y: y - 1.6 }, thickness: 0.6, color: INK });
  }

  /** სტრიქონებად დაყოფა სიგანით (სიტყვებით; ძალიან გრძელი სიტყვა — სიმბოლოებით). */
  wrap(text: string, size: number, maxWidth: number, weight: Weight = 400): string[] {
    const out: string[] = [];
    for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.width(candidate, size, weight) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) out.push(line);
        line = "";
        let rest = word;
        while (this.width(rest, size, weight) > maxWidth) {
          let n = rest.length - 1;
          while (n > 1 && this.width(rest.slice(0, n), size, weight) > maxWidth) n--;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  }
}

/** ახალი PDF ქართული ფონტით. */
export async function createDocument(title: string, family: FontFamily) {
  const { bytes, coverage } = await loadFonts(family);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title);
  pdf.setCreator("Clinic-Soft");
  pdf.setCreationDate(new Date());
  const embed = (list: Uint8Array[]) => Promise.all(list.map((b) => pdf.embedFont(b, { subset: true })));
  const [regular, bold] = await Promise.all([embed(bytes[400]), embed(bytes[700])]);
  return { pdf, ts: new Typesetter({ 400: regular, 700: bold }, coverage) };
}

/** სურათი PDF-ში (PNG ან JPG — შიგთავსით). */
export function embedImage(pdf: PDFDocument, bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? pdf.embedJpg(bytes) : pdf.embedPng(bytes);
}

/** ყველა გვერდზე: „დრაფტი“ წყალნიშანი (წინასწარი ნახვა) და ქვედა კოლონტიტული. */
export function finishPages(
  pages: PDFPage[],
  ts: Typesetter,
  { draft, footer, margin }: { draft: boolean; footer: (page: number, total: number) => string; margin: number },
) {
  pages.forEach((p, i) => {
    const { width, height } = p.getSize();
    if (draft) {
      const mark = "დრაფტი — ხელმოუწერელი";
      const size = Math.min(40, ((width - margin * 2) / ts.width(mark, 40, 700)) * 40);
      ts.draw(p, mark, (width - ts.width(mark, size, 700)) / 2, height / 2, size, 700, rgb(0.8, 0.1, 0.1), 0.15);
    }
    ts.draw(p, footer(i + 1, pages.length), margin, 24, 7.5, 400, MUTED);
  });
}
