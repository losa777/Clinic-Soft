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
  patient: { name: "ნინო ბერიძე", personalId: "01099000001", birthDate: "01.01.1990", gender: "მდედრობითი" },
  doctor: { name: "დავით მაისურაძე", specialty: "კარდიოლოგი" },
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

  it("სიგრძე და თარიღის ფორმატი", () => {
    const r = validateDocumentValues("certificate_100", { destination: "ა".repeat(501), periodFrom: "2026-13" }, false);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errors.destination && r.errors.periodFrom);
  });

  it("ავტომატური შევსება ვიზიტიდან: ძირითადი დიაგნოზი პირველია", () => {
    const v = DOCUMENT_TEMPLATES.visit_summary.prefill({
      visitDate: "2026-10-22",
      patient: { address: null },
      diagnoses: [
        { code: "E11", name: "დიაბეტი", primary: false },
        { code: "I10", name: "ჰიპერტენზია", primary: true },
      ],
      complaints: "თავის ტკივილი",
      anamnesisDisease: null,
      examination: null,
      treatmentPlan: null,
      recommendations: null,
      vitals: "წნევა 140/90",
      prescriptions: ["ამლოდიპინი 5 მგ"],
      studies: [],
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
    const bytes = await renderDocumentPdf({ ...base, type: "certificate_100", draft: true, values: { diagnosis: "I10 — ჰიპერტენზია" }, signatures: [] });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  });
});
