import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildXlsx, columnName, crc32 } from "./xlsx.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("Excel (.xlsx) ფაილი", () => {
  it("სვეტების სახელები: A … Z, AA, AZ, BA", () => {
    assert.deepEqual([0, 25, 26, 51, 52].map(columnName), ["A", "Z", "AA", "AZ", "BA"]);
  });

  it("CRC32 — სტანდარტული საკონტროლო მნიშვნელობა", () => {
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  });

  it("ZIP არქივი: ხელმოწერა, ყველა საჭირო ნაწილი, ქართული ტექსტი და XML-ის სპეციალური სიმბოლოები", () => {
    const file = buildXlsx("საოპერაციო", [{ header: "პირადი ნომერი" }, { header: "დიაგნოზი" }], [["01001012345", "K35 <მწვავე> & გართულება"]]);
    assert.deepEqual([...file.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    const content = text(file);
    for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) assert.ok(content.includes(part), part);
    // პირადი ნომერი ტექსტად (წამყვანი ნული რჩება)
    assert.ok(content.includes('t="inlineStr" s="2"><is><t xml:space="preserve">01001012345</t>'));
    assert.ok(content.includes("K35 &lt;მწვავე&gt; &amp; გართულება"));
    assert.ok(content.includes('<autoFilter ref="A1:B2"/>'));
  });
});
