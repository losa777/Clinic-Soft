/**
 * სამედიცინო დოკუმენტის PDF (A4). ფორმა 100 — საკუთარი განლაგებით (form100-pdf.ts), დანარჩენი — ზოგადით:
 * კლინიკის თავფურცელი, პაციენტი, ექიმი, შაბლონის ველები რიგით, ხელმოწერები.
 * დამოკიდებულება მხოლოდ pdf-lib-ზე და ფაილურ სისტემაზე (ტესტებიდანაც გამოიძახება).
 */
import type { PDFPage } from "pdf-lib";
import { renderForm100 } from "./form100-pdf.ts";
import { DOCUMENT_TEMPLATES, type DocumentTypeCode, MEDICATION_COLUMNS, parseMedications, SIGNER_ROLE_LABELS, type SignerRoleCode } from "./templates.ts";
import { createDocument, embedImage, finishPages, INK, MUTED, type Weight } from "./typeset.ts";

/** png = null — ხელით, დაბეჭდვის შემდეგ (PDF-ში ცარიელი ადგილი ხელმოწერისთვის). */
export type PdfSignature = { role: SignerRoleCode; name: string; png: Uint8Array | null; signedAt: string };

export type DocumentPdfInput = {
  type: DocumentTypeCode;
  documentId: number;
  version: number;
  /** ხელმოწერამდე (წინასწარი ნახვა) — „დრაფტი“ წყალნიშნით */
  draft: boolean;
  /** თარიღი DD.MM.YYYY (ხელმოწერის ან დღევანდელი) */
  date: string;
  /** დოკუმენტის ნომერი (ფორმა 100 — ცნობის №); დრაფტში — null */
  docNumber: string | null;
  clinic: { name: string; address: string | null; phone: string | null };
  patient: { name: string; personalId: string; birthDate: string; age: number; gender: string | null; cardNumber: string | null };
  doctor: { name: string; specialty: string | null };
  /** დაწესებულების ხელმძღვანელი (რეკვიზიტებიდან) */
  head: { name: string | null };
  values: Record<string, string>;
  signatures: PdfSignature[];
  /** ბეჭდის სურათი (PNG/JPG) — თუ ხელმოწერისას აირჩიეს */
  stamp: Uint8Array | null;
};

const isoToDisplay = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join(".") : v);

/** ხელმომწერის სახელი (ხელმოწერა თუ ჯერ არ არის — დოკუმენტის მონაცემებიდან). */
export function signerName(input: Pick<DocumentPdfInput, "doctor" | "patient" | "head">, role: SignerRoleCode) {
  return role === "doctor" ? input.doctor.name : role === "patient" ? input.patient.name : (input.head.name ?? "");
}

export async function renderDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
  return input.type === "certificate_100" ? renderForm100(input) : renderGeneric(input);
}

const PAGE = { width: 595.28, height: 841.89, margin: 50 };

async function renderGeneric(input: DocumentPdfInput): Promise<Uint8Array> {
  const template = DOCUMENT_TEMPLATES[input.type];
  const { pdf, ts } = await createDocument(template.title, "sans");
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
    ["დოკუმენტი", `N ${input.docNumber ?? input.documentId}${input.version > 1 ? `, ვერსია ${input.version}` : ""}`],
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
    const value =
      (f.kind === "date"
        ? isoToDisplay(raw)
        : f.kind === "medications"
          ? parseMedications(raw)
              .map((r) => MEDICATION_COLUMNS.map((c) => r[c.key]).filter(Boolean).join(" · "))
              .join("\n")
          : raw) || "—";
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
    if (s.signature?.png) {
      const img = await embedImage(pdf, s.signature.png);
      const scale = Math.min((boxWidth - 10) / img.width, 60 / img.height, 1);
      page.drawImage(img, { x, y: lineY + 2, width: img.width * scale, height: img.height * scale });
    }
    page.drawLine({ start: { x, y: lineY }, end: { x: x + boxWidth, y: lineY }, thickness: 0.6, color: INK });
    ts.draw(page, `${SIGNER_ROLE_LABELS[s.role]}: ${s.signature?.name ?? signerName(input, s.role)}`, x, lineY - 13, 9.5);
    if (s.signature?.png) ts.draw(page, `ხელმოწერილია ელექტრონულად: ${s.signature.signedAt}`, x, lineY - 26, 8.5, 400, MUTED);
  }
  y -= 110;

  finishPages(pages, ts, {
    draft: input.draft,
    margin,
    footer: (n, total) =>
      `${template.title} N ${input.docNumber ?? input.documentId}${input.version > 1 ? ` · ვერსია ${input.version}` : ""} · გვერდი ${n}/${total}`,
  });
  return pdf.save();
}
