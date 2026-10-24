import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bucketKeys, bucketLabel, changePercent, groupingFor } from "./analytics-format.ts";

describe("ფინანსური ანალიზი — პერიოდი", () => {
  it("62 დღემდე — დღეებით, მეტი — თვეებით", () => {
    assert.equal(groupingFor("2026-10-01", "2026-10-31"), "day");
    assert.equal(groupingFor("2026-09-01", "2026-11-01"), "day"); // 61 დღის სხვაობა
    assert.equal(groupingFor("2026-01-01", "2026-10-24"), "month");
  });

  it("ყველა დღე/თვე (ცარიელიც), წლის გადასვლით", () => {
    assert.deepEqual(bucketKeys("2026-12-30", "2027-01-02", "day"), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    assert.deepEqual(bucketKeys("2025-11-15", "2026-02-03", "month"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
    assert.deepEqual(bucketKeys("2026-10-05", "2026-10-20", "month"), ["2026-10"]);
  });

  it("წარწერები", () => {
    assert.equal(bucketLabel("2026-10-24"), "24.10");
    assert.equal(bucketLabel("2026-10-24", true), "24.10.2026");
    assert.equal(bucketLabel("2026-01"), "იან");
    assert.equal(bucketLabel("2026-12", true), "დეკ 2026");
  });

  it("ცვლილება %: წინა 0 — შედარება არ არის", () => {
    assert.equal(changePercent("150.00", "100.00"), 50);
    assert.equal(changePercent(80, 100), -20);
    assert.equal(changePercent("1", "3"), -66.7);
    assert.equal(changePercent("100", "0.00"), null);
  });
});
