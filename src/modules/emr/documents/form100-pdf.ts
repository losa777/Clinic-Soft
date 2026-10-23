/**
 * ფორმა IV-100/ა — „ცნობა ჯანმრთელობის მდგომარეობის შესახებ“ (მინისტრის 2007 წლის 9 აგვისტოს №338/ნ ბრძანება, დანართი №2).
 * განლაგება ოფიციალური ნიმუშის მიხედვით: დანომრილი პუნქტები (გახაზული სათაურებით), მედიკამენტების ცხრილი,
 * ხელმოწერები (ელექტრონული ან ცარიელი ადგილი ხელით მოსაწერად), ბეჭედი, გაცემის თარიღი.
 * ველების მნიშვნელობები — templates.ts (certificate_100), გასაღებები ემთხვევა.
 */
import type { PDFPage } from "pdf-lib";
import type { DocumentPdfInput } from "./pdf.ts";
import { MEDICATION_COLUMNS, parseMedications } from "./templates.ts";
import { createDocument, embedImage, finishPages, INK, type Weight } from "./typeset.ts";

const ANNEX = "დანართი N2 დამტკიცებულია საქართველოს შრომის, ჯანმრთელობისა და სოციალური დაცვის მინისტრის 2007 წლის 9 აგვისტოს N338/ნ ბრძანებით";

const W = 595.28;
const H = 841.89;
const LEFT = 48;
const RIGHT = 42;
const TOP = 40;
const BOTTOM = 48;
const CONTENT = W - LEFT - RIGHT;
const SIZE = 10;
const LINE = 13;
/** მოკლე პუნქტების (3–8) მნიშვნელობის სვეტი */
const VALUE_COLUMN = LEFT + 270;
const SUB_INDENT = 72;

/** DD.MM.YYYY → DD/MM/YYYY (ნიმუშის ფორმატი) */
const slash = (d: string) => d.replaceAll(".", "/");

export async function renderForm100(input: DocumentPdfInput): Promise<Uint8Array> {
  const { pdf, ts } = await createDocument("ცნობა ჯანმრთელობის მდგომარეობის შესახებ", "serif");
  const v = (key: string) => input.values[key]?.trim() ?? "";
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - TOP;
  };
  const ensure = (needed: number) => {
    if (y - needed < BOTTOM) newPage();
  };

  /** ტექსტის ბლოკი (გადატანით), x-დან მარჯვენა კიდემდე. */
  const block = (text: string, x = LEFT, weight: Weight = 400, size = SIZE) => {
    for (const line of ts.wrap(text, size, W - RIGHT - x, weight)) {
      ensure(LINE);
      ts.draw(page, line, x, y - size, size, weight);
      y -= LINE;
    }
  };
  /** გახაზული სათაური (შეიძლება რამდენიმე სტრიქონად); აბრუნებს ბოლო სტრიქონის ბოლოს x-ს. */
  const heading = (text: string, x = LEFT, maxWidth = W - RIGHT - x) => {
    const lines = ts.wrap(text, SIZE, maxWidth, 700);
    let end = x;
    lines.forEach((line, i) => {
      ensure(LINE);
      ts.drawUnderlined(page, line, x, y - SIZE, SIZE);
      end = x + ts.width(line, SIZE, 700);
      if (i < lines.length - 1) y -= LINE;
    });
    return end;
  };
  /**
   * პუნქტი: სათაური და მნიშვნელობა. inline — მოკლე მნიშვნელობა იმავე ხაზზე (column-იდან ან სათაურის შემდეგ),
   * სხვაგვარად — სათაურის ქვემოთ.
   */
  const item = (label: string, value: string, opts: { indent?: number; inline?: boolean; column?: number } = {}) => {
    const x = LEFT + (opts.indent ?? 0);
    const end = heading(label, x);
    const single = !value.includes("\n");
    const at = Math.max(opts.column ?? 0, end + 8);
    if (opts.inline !== false && single && at + ts.width(value, SIZE) <= W - RIGHT) {
      if (value) ts.draw(page, value, at, y - SIZE, SIZE);
      y -= LINE;
      return;
    }
    y -= LINE;
    if (value) block(value);
  };
  const gap = (h = 3) => {
    y -= h;
  };

  newPage();

  // მარჯვნივ ზემოთ — ბრძანების რეკვიზიტები ჩარჩოში
  const boxWidth = 200;
  const boxX = W - RIGHT - boxWidth;
  const annexLines = ts.wrap(ANNEX, 7.5, boxWidth - 10, 700);
  const boxHeight = annexLines.length * 9.5 + 8;
  page.drawRectangle({ x: boxX, y: y - boxHeight, width: boxWidth, height: boxHeight, borderColor: INK, borderWidth: 0.6 });
  annexLines.forEach((line, i) => ts.draw(page, line, boxX + 5, y - 4 - 7.5 - i * 9.5, 7.5, 700));
  y -= boxHeight + 16;

  // სათაური და ცნობის ნომერი
  const title = "ჯანმრთელობის მდგომარეობის შესახებ";
  ts.drawUnderlined(page, title, (W - ts.width(title, 10.5, 700)) / 2, y - 10.5, 10.5);
  y -= 16;
  const word = "ც ნ ო ბ ა № ";
  const number = input.docNumber ?? "—";
  const numberX = (W - ts.width(word, 10.5, 700) - ts.width(number, 10.5)) / 2;
  ts.drawUnderlined(page, word, numberX, y - 10.5, 10.5);
  ts.draw(page, number, numberX + ts.width(word, 10.5, 700), y - 10.5, 10.5);
  y -= 26;

  item("1. ცნობის გამცემი დაწესებულების დასახელება და მისამართი:", [input.clinic.name, input.clinic.address].filter(Boolean).join(", "), { inline: false });
  gap();
  item("2. დაწესებულების დასახელება, მისამართი სადაც იგზავნება ცნობა:", v("destination"), { inline: false });
  gap();
  // 3–5: შეწეული, მნიშვნელობა — სვეტში
  const card = input.patient.cardNumber ? `     ს/ბარათის № ${input.patient.cardNumber}` : "";
  item("3. პაციენტის სახელი და გვარი:", `${input.patient.name}${card}`, { indent: SUB_INDENT, column: VALUE_COLUMN - 40 });
  item("4. დაბადების თარიღი (რიცხვი.თვე.წელი/ასაკი):", `${slash(input.patient.birthDate)} / ${input.patient.age} წ.`, {
    indent: SUB_INDENT,
    column: VALUE_COLUMN + 60,
  });
  item("5. პირადი ნომერი:", input.patient.personalId, { indent: SUB_INDENT, column: VALUE_COLUMN - 40 });
  item("6. მისამართი:", v("address"), { column: LEFT + 110 });
  item("7. სამუშაო ადგილი და თანამდებობა:", v("workplace"), { indent: SUB_INDENT, column: VALUE_COLUMN });

  // 8. თარიღები: პირველი ქვეპუნქტი იმავე ხაზზე
  ensure(LINE * 4);
  ts.drawUnderlined(page, "8. თარიღები", LEFT, y - SIZE, SIZE);
  const dates: [string, string][] = [
    ["ა) ამბულატორული მიმართვის:", v("dateReferral")],
    ["ბ) სტაციონარში გაგზავნის:", v("dateHospitalSent")],
    ["გ) სტაციონარში მოთავსების:", v("dateHospitalAdmitted")],
    ["დ) გაწერის:", v("dateDischarge")],
  ];
  for (const [label, value] of dates) item(label, value, { indent: SUB_INDENT + 30, column: VALUE_COLUMN });
  gap();

  // 9. დიაგნოზი: ძირითადი / გართულება / თანმხლები
  item("9. დასკვნა ჯანმრთელობის მდგომარეობის შესახებ ან სრული დიაგნოზი:", "", { inline: false });
  for (const [label, key] of [
    ["ძირითადი:", "dxPrimary"],
    ["გართულება:", "dxComplication"],
    ["თანმხლები:", "dxConcomitant"],
  ] as const) {
    item(label, v(key), { inline: false });
  }
  gap();

  for (const [label, key] of [
    ["10. გადატანილი დაავადებები:", "pastDiseases"],
    ["11. მოკლე ანამნეზი:", "anamnesis"],
    ["12. ჩატარებული დიაგნოსტიკური გამოკვლევები და კონსულტაციები:", "studies"],
    ["13. ავადმყოფობის მიმდინარეობა:", "course"],
    ["14. ჩატარებული მკურნალობა:", "treatment"],
    ["15. მდგომარეობა სტაციონარში გაგზავნისას:", "conditionSent"],
    ["16. მდგომარეობა სტაციონარიდან გაწერისას:", "conditionDischarge"],
    ["17. სამკურნალო და შრომითი რეკომენდაციები:", "recommendations"],
  ] as const) {
    item(label, v(key), { inline: false });
    gap(2);
  }

  // 17. მედიკამენტების ცხრილი
  const rows = parseMedications(v("medications"));
  if (rows.length) {
    gap(6);
    const widths = [0.31, 0.19, 0.12, 0.15, 0.23].map((k) => k * CONTENT);
    const cell = 9;
    const pad = 3;
    const drawRow = (cells: string[]) => {
      const wrapped = cells.map((text, i) => ts.wrap(text, cell, widths[i] - pad * 2));
      const height = Math.max(...wrapped.map((l) => l.length)) * 11 + pad * 2;
      return { wrapped, height };
    };
    const header = MEDICATION_COLUMNS.map((c) => c.label);
    const paint = ({ wrapped, height }: ReturnType<typeof drawRow>, centeredCols: number[]) => {
      let x = LEFT;
      wrapped.forEach((lines, i) => {
        page.drawRectangle({ x, y: y - height, width: widths[i], height, borderColor: INK, borderWidth: 0.5 });
        lines.forEach((line, j) => {
          const tx = centeredCols.includes(i) ? x + (widths[i] - ts.width(line, cell)) / 2 : x + pad;
          ts.draw(page, line, tx, y - pad - cell - j * 11 + 1, cell);
        });
        x += widths[i];
      });
      y -= height;
    };
    const headerRow = drawRow(header);
    ensure(headerRow.height + 30);
    paint(headerRow, []);
    for (const r of rows) {
      const row = drawRow(MEDICATION_COLUMNS.map((c) => r[c.key]));
      if (y - row.height < BOTTOM) {
        newPage();
        paint(headerRow, []);
      }
      paint(row, [2, 3]);
    }
    gap(10);
  }

  // 18–20: ხელმოწერები, ბეჭედი, თარიღი
  ensure(190);
  gap(24);
  const signatureX = LEFT + 150;
  const nameX = LEFT + 300;
  const signatureRow = async (labelLines: string[], role: "doctor" | "head") => {
    const sig = input.signatures.find((s) => s.role === role);
    const name = sig?.name ?? (role === "doctor" ? input.doctor.name : (input.head.name ?? ""));
    const top = y;
    labelLines.forEach((line, i) => ts.drawUnderlined(page, line, LEFT, y - SIZE - i * LINE, SIZE));
    const baseline = y - SIZE - (labelLines.length - 1) * LINE;
    if (sig?.png) {
      const img = await embedImage(pdf, sig.png);
      const scale = Math.min(130 / img.width, 48 / img.height, 1);
      page.drawImage(img, { x: signatureX, y: baseline - 6, width: img.width * scale, height: img.height * scale });
    }
    if (name) ts.draw(page, `/${name}/`, nameX, baseline, SIZE);
    y = Math.min(top - labelLines.length * LINE, baseline - 6) - 34;
  };
  const stampTop = y;
  await signatureRow(["18. მკურნალი ექიმი:"], "doctor");
  await signatureRow(["19. დაწესებულების ხელმძღვანელის", "/ ხელმძღვანელის მოადგილის ხელმოწერა:"], "head");
  if (input.stamp) {
    const img = await embedImage(pdf, input.stamp);
    const size = 110;
    const scale = Math.min(size / img.width, size / img.height);
    page.drawImage(img, { x: W - RIGHT - size - 10, y: stampTop - size - 10, width: img.width * scale, height: img.height * scale });
  }
  item("20. ცნობის გაცემის თარიღი:", input.draft ? "" : slash(input.date), { column: LEFT + 200 });

  finishPages(pages, ts, {
    draft: input.draft,
    margin: LEFT,
    footer: (n, total) => `ცნობა № ${number}${input.version > 1 ? ` · ვერსია ${input.version}` : ""} · გვერდი ${n}/${total}`,
  });
  return pdf.save();
}
