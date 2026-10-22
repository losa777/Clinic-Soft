/**
 * სამედიცინო დოკუმენტის PDF (A4): კლინიკის თავფურცელი, პაციენტი, ექიმი, შაბლონის ველები, ხელმოწერები.
 * ფონტი — Noto Sans Georgian (@fontsource, OFL): ქართული, ლათინური, ციფრები ცალ-ცალკე ფაილებშია,
 * ამიტომ ტექსტი სიმბოლოების მიხედვით ნაწილდება იმ ფონტზე, რომელსაც ეს სიმბოლო აქვს.
 * დამოკიდებულება მხოლოდ pdf-lib-ზე და ფაილურ სისტემაზე (ტესტებიდანაც გამოიძახება).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import { DOCUMENT_TEMPLATES, type DocumentTypeCode, SIGNER_ROLE_LABELS, type SignerRoleCode } from "./templates.ts";

export type PdfSignature = { role: SignerRoleCode; name: string; png: Uint8Array; signedAt: string };

export type DocumentPdfInput = {
  type: DocumentTypeCode;
  documentId: number;
  version: number;
  /** ხელმოწერამდე (წინასწარი ნახვა) — „დრაფტი“ წყალნიშნით */
  draft: boolean;
  date: string;
  clinic: { name: string; address: string | null; phone: string | null };
  patient: { name: string; personalId: string; birthDate: string; gender: string | null };
  doctor: { name: string; specialty: string | null };
  values: Record<string, string>;
  signatures: PdfSignature[];
};

const SUBSETS = ["georgian", "latin", "latin-ext", "symbols"] as const;
const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans-georgian", "files");

type Weight = 400 | 700;
type FontFiles = Record<Weight, Uint8Array[]>;
type Coverage = { hasGlyphForCodePoint(cp: number): boolean };

let fontFiles: Promise<{ bytes: FontFiles; coverage: Record<Weight, Coverage[]> }> | null = null;

/** ფონტის ფაილები (ერთხელ იკითხება პროცესში). */
function loadFonts() {
  fontFiles ??= (async () => {
    const read = (w: Weight) => Promise.all(SUBSETS.map((s) => readFile(path.join(FONT_DIR, `noto-sans-georgian-${s}-${w}-normal.woff`))));
    const [regular, bold] = await Promise.all([read(400), read(700)]);
    const bytes: FontFiles = { 400: regular.map((b) => new Uint8Array(b)), 700: bold.map((b) => new Uint8Array(b)) };
    const coverage = {
      400: bytes[400].map((b) => fontkit.create(b) as unknown as Coverage),
      700: bytes[700].map((b) => fontkit.create(b) as unknown as Coverage),
    };
    return { bytes, coverage };
  })().catch((error) => {
    fontFiles = null;
    throw error;
  });
  return fontFiles;
}

const isoToDisplay = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join(".") : v);

/** სიმბოლოები, რომლებიც ფონტში არ არის. */
const SUBSTITUTES: Record<string, string> = { "№": "N" };

const PAGE = { width: 595.28, height: 841.89, margin: 50 };
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);

/** ტექსტის აწყობა რამდენიმე ფონტით: ყოველი სიმბოლო — პირველ ფონტზე, რომელსაც ეს სიმბოლო აქვს. */
class Typesetter {
  private fonts: Record<Weight, PDFFont[]>;
  private coverage: Record<Weight, Coverage[]>;

  constructor(fonts: Record<Weight, PDFFont[]>, coverage: Record<Weight, Coverage[]>) {
    this.fonts = fonts;
    this.coverage = coverage;
  }

  private runs(text: string, weight: Weight): { font: PDFFont; text: string }[] {
    const result: { font: PDFFont; text: string }[] = [];
    for (const ch of text.replace(/[№]/g, (c) => SUBSTITUTES[c] ?? c)) {
      const cp = ch.codePointAt(0)!;
      let i = this.coverage[weight].findIndex((c) => c.hasGlyphForCodePoint(cp));
      if (i < 0) i = 0;
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

export async function renderDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
  const template = DOCUMENT_TEMPLATES[input.type];
  const { bytes, coverage } = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(template.title);
  pdf.setCreator("Clinic-Soft");
  pdf.setCreationDate(new Date());
  const embed = (list: Uint8Array[]) => Promise.all(list.map((b) => pdf.embedFont(b, { subset: true })));
  const [regular, bold] = await Promise.all([embed(bytes[400]), embed(bytes[700])]);
  const ts = new Typesetter({ 400: regular, 700: bold }, coverage);

  const { width, height, margin } = PAGE;
  const contentWidth = width - margin * 2;
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    pages.push(page);
    y = height - margin;
  };
  const ensure = (needed: number) => {
    if (y - needed < margin + 30) newPage();
  };
  const centered = (text: string, size: number, weight: Weight, color = INK) => {
    for (const line of ts.wrap(text, size, contentWidth, weight)) {
      ensure(size + 4);
      ts.draw(page, line, (width - ts.width(line, size, weight)) / 2, y - size, size, weight, color);
      y -= size + 4;
    }
  };

  newPage();
  // კლინიკის თავფურცელი
  centered(input.clinic.name, 14, 700);
  const contacts = [input.clinic.address, input.clinic.phone && `ტელ. ${input.clinic.phone}`].filter(Boolean).join(" · ");
  if (contacts) centered(contacts, 9, 400, MUTED);
  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: INK });
  y -= 18;

  centered(template.title, 15, 700);
  if (template.subtitle) centered(template.subtitle, 10, 400, MUTED);
  y -= 10;

  // ძირითადი მონაცემები: ორ სვეტად (სათაური — მნიშვნელობა)
  const meta: [string, string][] = [
    ["დოკუმენტი", `N ${input.documentId}${input.version > 1 ? `, ვერსია ${input.version}` : ""}`],
    ["თარიღი", input.date],
    ["პაციენტი", input.patient.name],
    ["პირადი ნომერი", input.patient.personalId],
    ["დაბადების თარიღი", input.patient.birthDate + (input.patient.gender ? ` · ${input.patient.gender}` : "")],
    ["ექიმი", input.doctor.name + (input.doctor.specialty ? ` (${input.doctor.specialty})` : "")],
  ];
  const labelWidth = 120;
  for (const [label, value] of meta) {
    const lines = ts.wrap(value, 10.5, contentWidth - labelWidth);
    ensure(lines.length * 14);
    ts.draw(page, label, margin, y - 10.5, 9.5, 400, MUTED);
    for (const line of lines) {
      ts.draw(page, line, margin + labelWidth, y - 10.5, 10.5, line === lines[0] && label === "პაციენტი" ? 700 : 400);
      y -= 14;
    }
  }
  y -= 10;

  // შაბლონის ველები: მოკლე (ერთსტრიქონიანი) — „სათაური: მნიშვნელობა“ ერთ ხაზზე, გრძელი — სათაურის ქვემოთ
  for (const f of template.fields) {
    const raw = input.values[f.key]?.trim() ?? "";
    const value = (f.kind === "date" ? isoToDisplay(raw) : raw) || "—";
    const label = `${f.label}:`;
    const inlineX = margin + ts.width(label, 10, 700) + 6;
    if (!value.includes("\n") && inlineX + ts.width(value, 10.5) <= width - margin) {
      ensure(16);
      ts.draw(page, label, margin, y - 10, 10, 700);
      ts.draw(page, value, inlineX, y - 10, 10.5);
      y -= 20;
      continue;
    }
    const lines = ts.wrap(value, 10.5, contentWidth);
    ensure(16 + Math.min(lines.length, 3) * 14);
    ts.draw(page, label, margin, y - 10, 10, 700);
    y -= 15;
    for (const line of lines) {
      ensure(14);
      ts.draw(page, line, margin, y - 10.5, 10.5);
      y -= 14;
    }
    y -= 6;
  }

  // ხელმოწერები
  const signers = template.signers.map((s) => ({ ...s, signature: input.signatures.find((x) => x.role === s.role) }));
  const boxWidth = (contentWidth - 20 * (signers.length - 1)) / signers.length;
  ensure(110);
  y -= 20;
  for (const [i, s] of signers.entries()) {
    const x = margin + i * (boxWidth + 20);
    const lineY = y - 70;
    if (s.signature) {
      const img = await pdf.embedPng(s.signature.png);
      const scale = Math.min((boxWidth - 10) / img.width, 60 / img.height, 1);
      page.drawImage(img, { x, y: lineY + 2, width: img.width * scale, height: img.height * scale });
    }
    page.drawLine({ start: { x, y: lineY }, end: { x: x + boxWidth, y: lineY }, thickness: 0.6, color: INK });
    const name = s.signature?.name ?? (s.role === "doctor" ? input.doctor.name : input.patient.name);
    ts.draw(page, `${SIGNER_ROLE_LABELS[s.role]}: ${name}`, x, lineY - 13, 9.5);
    if (s.signature) ts.draw(page, `ხელმოწერილია: ${s.signature.signedAt}`, x, lineY - 26, 8.5, 400, MUTED);
  }
  y -= 110;

  // წყალნიშანი და ქვედა კოლონტიტული ყველა გვერდზე
  pages.forEach((p, i) => {
    if (input.draft) {
      const mark = "დრაფტი — ხელმოუწერელი";
      const size = Math.min(40, (contentWidth / ts.width(mark, 40, 700)) * 40);
      ts.draw(p, mark, (width - ts.width(mark, size, 700)) / 2, height / 2, size, 700, rgb(0.8, 0.1, 0.1), 0.15);
    }
    const footer = `${template.title} N ${input.documentId}${input.version > 1 ? ` · ვერსია ${input.version}` : ""} · გვერდი ${i + 1}/${pages.length}`;
    ts.draw(p, footer, margin, 28, 8, 400, MUTED);
  });

  return pdf.save();
}
