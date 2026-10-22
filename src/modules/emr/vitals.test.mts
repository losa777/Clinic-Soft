import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bmi, checkVital, parseVital, vitalFlag } from "./vitals.ts";

describe("ვიტალური მაჩვენებლები", () => {
  it("რიცხვის წაკითხვა (მძიმეც)", () => {
    assert.equal(parseVital("36,6"), 36.6);
    assert.equal(parseVital(" 120 "), 120);
    assert.equal(parseVital(""), null);
    assert.ok(Number.isNaN(parseVital("120/80")));
  });

  it("დასაშვები დიაპაზონი და ათწილადები", () => {
    assert.equal(checkVital("bpSystolic", 120), null);
    assert.match(checkVital("bpSystolic", 400)!, /40–300/);
    assert.match(checkVital("pulse", 72.5)!, /მთელი/);
    assert.equal(checkVital("temperature", 36.6), null);
    for (const t of [37.3, 38.7, 39.1, 35.9]) assert.equal(checkVital("temperature", t), null, String(t));
    assert.equal(checkVital("weightKg", 72.3), null);
    assert.match(checkVital("temperature", 36.65)!, /ათწილადი/);
    assert.match(checkVital("spo2", Number.NaN)!, /რიცხვი/);
    assert.equal(checkVital("weightKg", null), null);
  });

  it("ნორმიდან გადახრა (ზრდასრული)", () => {
    assert.equal(vitalFlag("bpSystolic", 150), "high");
    assert.equal(vitalFlag("bpSystolic", 120), "normal");
    assert.equal(vitalFlag("bpDiastolic", 55), "low");
    assert.equal(vitalFlag("temperature", 38.2), "high");
    assert.equal(vitalFlag("temperature", 37.2), "normal");
    assert.equal(vitalFlag("spo2", 92), "low");
    assert.equal(vitalFlag("weightKg", 80), null);
    assert.equal(vitalFlag("pulse", null), null);
  });

  it("BMI და კატეგორია", () => {
    assert.deepEqual(bmi(70, 175), { value: 22.9, category: "normal" });
    assert.deepEqual(bmi(95, 175), { value: 31, category: "obese" });
    assert.deepEqual(bmi(50, 175), { value: 16.3, category: "underweight" });
    assert.deepEqual(bmi(80, 175), { value: 26.1, category: "overweight" });
    assert.equal(bmi(70, null), null);
  });
});
