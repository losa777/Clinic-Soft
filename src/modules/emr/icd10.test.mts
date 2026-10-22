import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDelimiter, mapRows, normalizeCode, parseCsv, resolveColumns } from "./icd10.ts";

describe("ICD-10: CSV", () => {
  it("ბრჭყალები, მძიმე და ხაზის გადატანა ველში, BOM, CRLF", () => {
    const csv = '﻿code,name_ka,name_en\r\nI10,"ესენციური ჰიპერტენზია","Essential (primary) hypertension"\r\nJ00,"ცხვირ-ხახის ""მწვავე"" ანთება, ჩვეულებრივი სურდო","Acute nasopharyngitis\n[common cold]"\r\n\r\n';
    assert.deepEqual(parseCsv(csv), [
      ["code", "name_ka", "name_en"],
      ["I10", "ესენციური ჰიპერტენზია", "Essential (primary) hypertension"],
      ["J00", 'ცხვირ-ხახის "მწვავე" ანთება, ჩვეულებრივი სურდო', "Acute nasopharyngitis\n[common cold]"],
    ]);
  });

  it("გამყოფის ამოცნობა", () => {
    assert.equal(detectDelimiter("code;name\nI10;x"), ";");
    assert.equal(detectDelimiter("code\tname"), "\t");
    assert.equal(detectDelimiter('"a,b";c;d'), ";");
    assert.deepEqual(parseCsv("code;name\nI10;ჰიპერტენზია"), [["code", "name"], ["I10", "ჰიპერტენზია"]]);
  });
});

describe("ICD-10: კოდი", () => {
  it("ნორმალიზაცია", () => {
    assert.equal(normalizeCode("i10"), "I10");
    assert.equal(normalizeCode(" E11.9 "), "E11.9");
    assert.equal(normalizeCode("E119"), "E11.9");
    assert.equal(normalizeCode("A000"), "A00.0");
    assert.equal(normalizeCode("G01*"), "G01");
    assert.equal(normalizeCode("A17.0†"), "A17.0");
    assert.equal(normalizeCode("U07.1"), "U07.1");
    assert.equal(normalizeCode("I10."), "I10");
  });

  it("არასწორი კოდი", () => {
    for (const bad of ["", "10", "II0", "I1", "I10.ABCDE", "A00-B99"]) assert.equal(normalizeCode(bad), null, bad);
  });
});

describe("ICD-10: სვეტები და ხაზები", () => {
  it("სათაურით (ქართულიც) და ხელით მითითებით", () => {
    assert.deepEqual(resolveColumns(["Code", "Name_KA", "Name_EN"]), { code: 0, ka: 1, en: 2 });
    assert.deepEqual(resolveColumns(["კოდი", "დასახელება"]), { code: 0, ka: 1, en: null });
    assert.deepEqual(resolveColumns(["x", "y", "z"], { code: "1", en: "3" }), { code: 0, ka: null, en: 2 });
    assert.throws(() => resolveColumns(["a", "b"]), /კოდის სვეტი/);
  });

  it("ცუდი ხაზები გამოტოვდება, დუბლიკატი — ბოლო, ქართულის გარეშე — ინგლისური", () => {
    const res = mapRows(
      [
        ["I10", "ჰიპერტენზია", "Hypertension"],
        ["XX", "ცუდი", ""],
        ["J00", "", "Common cold"],
        ["K29.7", "", ""],
        ["i10", "ესენციური ჰიპერტენზია", "Essential hypertension"],
      ],
      { code: 0, ka: 1, en: 2 },
    );
    assert.deepEqual(res.rows, [
      { code: "I10", nameKa: "ესენციური ჰიპერტენზია", nameEn: "Essential hypertension" },
      { code: "J00", nameKa: "Common cold", nameEn: "Common cold" },
    ]);
    assert.equal(res.englishOnly, 1);
    assert.deepEqual(
      res.skipped.map((s) => s.line),
      [3, 5],
    );
  });
});
