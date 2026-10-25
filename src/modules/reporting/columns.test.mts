import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLUMN_GROUPS, DEFAULT_COLUMNS, EXPORT_COLUMNS, isColumnKey, pickColumns } from "./columns.ts";

describe("ანგარიშგება — ექსპორტის სვეტები", () => {
  it("კოდები უნიკალურია და ყველა სვეტს ცნობილი ჯგუფი აქვს", () => {
    assert.equal(new Set(EXPORT_COLUMNS.map((c) => c.key)).size, EXPORT_COLUMNS.length);
    const groups = new Set<string>(COLUMN_GROUPS.map((g) => g.value));
    for (const c of EXPORT_COLUMNS) assert.ok(groups.has(c.group), c.key);
  });

  it("URL/შაბლონის კოდები: უცნობი და დუბლიკატი გამოიტოვება, რიგი — ცხრილისა", () => {
    assert.deepEqual(pickColumns(["form100Number", "x", "lastName", "lastName", "<script>"]), ["lastName", "form100Number"]);
    assert.deepEqual(pickColumns([]), []);
    assert.equal(isColumnKey("personalId"), true);
    assert.equal(isColumnKey("constructor"), false);
  });

  it("ნაგულისხმევ ნაკრებში ფორმა 100-ის ნომერი და პირადი ნომერი შედის", () => {
    assert.ok(DEFAULT_COLUMNS.includes("form100Number"));
    assert.ok(DEFAULT_COLUMNS.includes("personalId"));
    assert.deepEqual(pickColumns(DEFAULT_COLUMNS), DEFAULT_COLUMNS);
  });
});
