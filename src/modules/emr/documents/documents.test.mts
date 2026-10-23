import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { renderDocumentPdf } from "./pdf.ts";
import { DOCUMENT_TEMPLATES, validateDocumentValues } from "./templates.ts";

// 1×1 გამჭვირვალე PNG — ხელმოწერის ნაცვლად
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const base = {
  documentId: 7,
  version: 2,
  date: "22.10.2026",
  clinic: { name: "სატესტო კლინიკა", address: "თბილისი", phone: "+995 32 200 00 00" },
  patient: { name: "ნინო ბერიძე", personalId: "01099000001", birthDate: "01.01.1990", age: 36, gender: "მდედრობითი", cardNumber: "6914/2026" },
  doctor: { name: "დავით მაისურაძე", specialty: "კარდიოლოგი" },
  head: { name: "ირაკლი წერეთელი" },
  docNumber: null,
  stamp: null,
};

describe("სამედიცინო დოკუმენტის შაბლონი", () => {
  it("სავალდებულო ველები მოწმდება მხოლოდ strict რეჟიმში", () => {
    assert.equal(validateDocumentValues("referral", {}, false).ok, true);
    const strict = validateDocumentValues("referral", { to: " ", reason: "" }, true);
    assert.equal(strict.ok, false);
    assert.deepEqual(Object.keys(strict.ok ? {} : strict.errors).sort(), ["reason", "to"]);
  });

  it("უცნობი ველები იშლება, ტექსტი იჭრება", () => {
    const r = validateDocumentValues("referral", { to: "  კარდიოლოგი ", hack: "x", reason: 5 }, false);
    assert.ok(r.ok);
    assert.equal(r.values.to, "კარდიოლოგი");
    assert.equal(r.values.reason, "");
    assert.equal("hack" in r.values, false);
  });

  it("სიგრძის შეზღუდვა", () => {
    const r = validateDocumentValues("certificate_100", { destination: "ა".repeat(501), dateReferral: "1".repeat(51) }, false);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errors.destination && r.errors.dateReferral);
  });

  it("მედიკამენტების ცხრილი: ცარიელი სტრიქონი და უცნობი სვეტი იშლება", () => {
    const r = validateDocumentValues(
      "certificate_100",
      { destination: "x", dxPrimary: "y", medications: JSON.stringify([{ drug: "ა", hack: "x" }, { drug: " " }]) },
      true,
    );
    assert.ok(r.ok);
    assert.deepEqual(JSON.parse(r.values.medications), [{ drug: "ა", note: "", duration: "", quantity: "", rxNumber: "" }]);
  });

  it("ფორმა 100: დიაგნოზები ტიპებით (ძირითადი / გართულება / თანმხლები), თარიღები, ცხრილი", () => {
    const v = DOCUMENT_TEMPLATES.certificate_100.prefill({
      visitDate: "2026-10-06",
      visitStart: "06/10/2026 10:30",
      visitEnd: "06/10/2026 14:00",
      patient: { address: "ზინდარი", conditions: ["N39.0 საშარდე გზების ინფექცია"] },
      diagnoses: [
        { code: "H26.2", name: "გართულებული კატარაქტა", primary: true, complication: false },
        { code: "H40.1", name: "პირველადი ღიაკუთხიანი გლაუკომა", primary: false, complication: false },
        { code: "H44.0", name: "ჩირქოვანი ენდოფთალმიტი", primary: false, complication: true },
      ],
      complaints: "მხედველობის დაქვეითება",
      anamnesisDisease: null,
      examination: "VisOD: 0.1",
      treatmentPlan: null,
      recommendations: "თვალი არ მოისრისოთ",
      vitals: null,
      prescriptions: [],
      studies: [],
      medicationRows: [{ drug: "ლამოფლოქსი", note: "1 წვეთი 6-ჯერ", duration: "7", quantity: "1", rxNumber: "" }],
      studiesDated: ["თვალის წნევის გაზომვა 06/10/2026"],
      proceduresDated: ["CJSE20 ფაკოემულსიფიკაცია 06/10/2026"],
      measurements: ["თვალშიდა წნევა (T) OD: 15.0 მმ Hg"],
    });
    assert.equal(v.dxPrimary, "H26.2 გართულებული კატარაქტა");
    assert.equal(v.dxComplication, "H44.0 ჩირქოვანი ენდოფთალმიტი");
    assert.equal(v.dxConcomitant, "H40.1 პირველადი ღიაკუთხიანი გლაუკომა");
    assert.equal(v.dateReferral, "06/10/2026 10:30");
    assert.equal(v.dateDischarge, "06/10/2026 14:00");
    assert.equal(v.pastDiseases, "N39.0 საშარდე გზების ინფექცია");
    assert.equal(v.studies, "VisOD: 0.1\nთვალშიდა წნევა (T) OD: 15.0 მმ Hg\nთვალის წნევის გაზომვა 06/10/2026");
    assert.equal(v.treatment, "CJSE20 ფაკოემულსიფიკაცია 06/10/2026");
    assert.equal(JSON.parse(v.medications)[0].drug, "ლამოფლოქსი");
  });

  it("ავტომატური შევსება ვიზიტიდან: ძირითადი დიაგნოზი პირველია", () => {
    const v = DOCUMENT_TEMPLATES.visit_summary.prefill({
      visitDate: "2026-10-22",
      visitStart: "22/10/2026 10:30",
      visitEnd: null,
      patient: { address: null, conditions: [] },
      diagnoses: [
        { code: "E11", name: "დიაბეტი", primary: false, complication: false },
        { code: "I10", name: "ჰიპერტენზია", primary: true, complication: false },
      ],
      complaints: "თავის ტკივილი",
      anamnesisDisease: null,
      examination: null,
      treatmentPlan: null,
      recommendations: null,
      vitals: "წნევა 140/90",
      prescriptions: ["ამლოდიპინი 5 მგ"],
      studies: [],
      medicationRows: [],
      studiesDated: [],
      proceduresDated: [],
      measurements: [],
    });
    assert.equal(v.diagnosis, "I10 — ჰიპერტენზია\nE11 — დიაბეტი");
    assert.equal(v.treatment, "• ამლოდიპინი 5 მგ");
  });
});

describe("PDF", () => {
  it("ქართული ტექსტი, ხელმოწერები, გრძელი ტექსტი — რამდენიმე გვერდზე", async () => {
    const bytes = await renderDocumentPdf({
      ...base,
      type: "consent",
      draft: false,
      values: { procedure: "ინექცია", explanation: "ძალიან გრძელი განმარტება. ".repeat(400), statement: "თანახმა ვარ" },
      signatures: [
        { role: "doctor", name: "დავით მაისურაძე", png: PNG, signedAt: "22.10.2026 14:00" },
        { role: "patient", name: "ნინო ბერიძე", png: PNG, signedAt: "22.10.2026 14:01" },
      ],
    });
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 2);
    assert.equal(doc.getTitle(), "ინფორმირებული თანხმობა");
    if (process.env.PDF_OUT) await writeFile(process.env.PDF_OUT, bytes);
  });

  it("დრაფტი (წინასწარი ნახვა) ხელმოწერის გარეშე", async () => {
    const bytes = await renderDocumentPdf({ ...base, type: "referral", draft: true, values: { to: "კარდიოლოგი", reason: "ტესტი" }, signatures: [] });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  });

  it("ფორმა 100: ნომერი, ცხრილი, ექიმი — ელექტრონულად, ხელმძღვანელი — ხელით, ბეჭედი, ემოჯი რეკომენდაციებში", async () => {
    const bytes = await renderDocumentPdf({
      ...base,
      version: 1,
      type: "certificate_100",
      draft: false,
      docNumber: "18692",
      stamp: PNG,
      values: {
        destination: "დანიშნულებისამებრ",
        address: "საქართველო, ზინდარი",
        dateReferral: "06/10/2026 10:30",
        dateDischarge: "06/10/2026 14:00",
        dxPrimary: "H26.2 გართულებული კატარაქტა (OD)",
        dxConcomitant: "H40.1 პირველადი ღიაკუთხიანი გლაუკომა (OD)\nH25.8 სხვა მოხუცებულობითი კატარაქტა (OS)",
        anamnesis: "პაციენტი უჩივის მხედველობის დაქვეითებას ორივე თვალში.",
        studies: "VisOD: 0.1\nVisOS: 0.4\nთვალის წნევის გაზომვა 06/10/2026\nოფთალმოლოგის კონსულტაცია ZYZX90 06/10/2026",
        course: "ქრონიკული",
        treatment: "CJSE20 ფაკოემულსიფიკაცია და ხელოვნური ბროლის იმპლანტირება უკანა საკანში 06/10/2026",
        conditionDischarge: "გაუმჯობესდა",
        recommendations: "❌ თვალი არ მოისრისოთ;\n💧 წვეთების გამოყენება\n⚠️ დაუყოვნებლივ დაუკავშირდით ექიმს",
        medications: JSON.stringify(
          Array.from({ length: 4 }, (_, i) => ({ drug: `მედიკამენტი ${i + 1} (0.5% 5მლ თვალის წვეთები)`, note: "1 წვეთი 4-ჯერ დღეში 1 თვე მარჯვენა თვალში", duration: "30", quantity: "1", rxNumber: "" })),
        ),
      },
      signatures: [
        { role: "doctor", name: "ონისე ნამჩევაძე", png: PNG, signedAt: "06.10.2026 14:00" },
        { role: "head", name: "ირაკლი წერეთელი", png: null, signedAt: "06.10.2026 14:00" },
      ],
    });
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
    assert.equal(doc.getTitle(), "ცნობა ჯანმრთელობის მდგომარეობის შესახებ");
    if (process.env.PDF_OUT) await writeFile(process.env.PDF_OUT.replace(".pdf", "-f100.pdf"), bytes);
  });
});
