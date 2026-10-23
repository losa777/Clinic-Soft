import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { definitionSchema, formatMeasurement, type MeasurementDef, measurementFlag, normalText, parseMeasurement, sidesOf } from "./measurements.ts";

const iop: MeasurementDef = {
  id: 2,
  name: "თვალშიდა წნევა (T)",
  unit: "მმ Hg",
  type: "number",
  sides: "eyes",
  min: 5,
  max: 60,
  normalMin: 10,
  normalMax: 21,
  decimals: 1,
  options: [],
  required: false,
};
const rhythm: MeasurementDef = { ...iop, id: 3, name: "გულის რიტმი", unit: null, type: "select", sides: "none", options: ["სინუსური", "მოციმციმე არითმია"] };
const edema: MeasurementDef = { ...rhythm, id: 4, name: "შეშუპება", type: "boolean", options: [] };

describe("სპეციალობის მაჩვენებლები", () => {
  it("რიცხვი: მძიმე, ფარგლები, ათწილადები, ცარიელი", () => {
    assert.deepEqual(parseMeasurement(iop, "15,5"), { ok: true, value: { num: 15.5, text: null } });
    assert.deepEqual(parseMeasurement(iop, "  "), { ok: true, value: null });
    assert.equal(parseMeasurement(iop, "70").ok, false);
    assert.equal(parseMeasurement(iop, "15.55").ok, false);
    assert.equal(parseMeasurement(iop, "abc").ok, false);
    assert.deepEqual(parseMeasurement({ ...iop, min: -30, max: 30, decimals: 2 }, "-0.25"), { ok: true, value: { num: -0.25, text: null } });
  });

  it("არჩევანი და კი/არა — მხოლოდ დასაშვები მნიშვნელობები", () => {
    assert.equal(parseMeasurement(rhythm, "სინუსური").ok, true);
    assert.equal(parseMeasurement(rhythm, "სხვა რამე").ok, false);
    assert.equal(parseMeasurement(edema, "yes").ok, true);
    assert.equal(parseMeasurement(edema, "maybe").ok, false);
  });

  it("ნორმიდან გადახრა და ნორმის ტექსტი", () => {
    assert.equal(measurementFlag(iop, 25), "high");
    assert.equal(measurementFlag(iop, 8), "low");
    assert.equal(measurementFlag(iop, 15), "normal");
    assert.equal(measurementFlag({ ...iop, normalMin: null, normalMax: null }, 15), null);
    assert.equal(normalText(iop), "10–21");
    assert.equal(normalText({ normalMin: null, normalMax: 5.2 }), "≤ 5.2");
  });

  it("მხარეები და ჩვენება: თვალები — OD/OS", () => {
    assert.deepEqual(sidesOf("eyes").map((s) => s.label), ["OD", "OS"]);
    assert.equal(formatMeasurement(iop, "right", { num: 15, text: null }), "თვალშიდა წნევა (T) OD: 15.0 მმ Hg");
    assert.equal(formatMeasurement(edema, "none", { num: null, text: "yes" }), "შეშუპება: კი");
  });

  it("ადმინის ფორმა: ვარიანტები, ფარგლები", () => {
    const base = { name: "X", unit: "", type: "number" as const, sides: "none" as const, min: "", max: "", normalMin: "", normalMax: "", decimals: 0, options: "" };
    assert.equal(definitionSchema.safeParse({ ...base, min: "10", max: "5" }).success, false);
    assert.equal(definitionSchema.safeParse({ ...base, type: "select", options: "ერთი" }).success, false);
    const ok = definitionSchema.safeParse({ ...base, type: "select", options: "ერთი\n ორი \nერთი\n" });
    assert.ok(ok.success);
    assert.deepEqual(ok.data.options, ["ერთი", "ორი"]);
  });
});
