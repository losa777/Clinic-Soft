import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysTo,
  allocateFefo,
  expiryStatus,
  fefoOrder,
  formatQuantity,
  fromDecimal,
  inputQuantity,
  parseQuantity,
  stockLevel,
  toDecimal,
  usableQuantity,
} from "./stock.ts";

const TODAY = "2026-10-24";

describe("რაოდენობა მეასედებში", () => {
  it("ტექსტი → მეასედები", () => {
    assert.equal(parseQuantity("2"), 200);
    assert.equal(parseQuantity("2,5"), 250);
    assert.equal(parseQuantity(" 2.05 "), 205);
    assert.equal(parseQuantity(1.5), 150);
    assert.equal(parseQuantity("2.555"), null);
    assert.equal(parseQuantity("-1"), null);
    assert.equal(parseQuantity("abc"), null);
    assert.equal(parseQuantity(""), null);
  });

  it("DECIMAL ↔ მეასედები", () => {
    assert.equal(toDecimal(250), "2.50");
    assert.equal(toDecimal(-5), "-0.05");
    assert.equal(fromDecimal("12.30"), 1230);
    assert.equal(fromDecimal("-1.5"), -150);
    assert.equal(fromDecimal({ toFixed: () => "7.25" }), 725);
    assert.equal(fromDecimal(null), 0);
  });

  it("ეკრანზე: ზედმეტი ნულების გარეშე", () => {
    assert.equal(formatQuantity(300), "3");
    assert.equal(formatQuantity(250), "2,5");
    assert.equal(formatQuantity(205), "2,05");
    assert.equal(formatQuantity(1_234_500), "12 345");
    assert.equal(formatQuantity(-150), "-1,5");
  });

  it("ფორმის ველი: ბრუნდება parseQuantity-ით", () => {
    for (const h of [0, 250, 1000, 10000, 1_234_500, 205]) assert.equal(parseQuantity(inputQuantity(h)), h);
    assert.equal(inputQuantity(1_234_500), "12345");
    assert.equal(inputQuantity(250), "2.5");
  });
});

describe("FEFO", () => {
  const batches = [
    { id: 1, expiryDate: null, quantity: 1000 },
    { id: 2, expiryDate: "2027-01-01", quantity: 300 },
    { id: 3, expiryDate: "2026-12-01", quantity: 200 },
    { id: 4, expiryDate: "2026-10-01", quantity: 500 }, // ვადაგასული
    { id: 5, expiryDate: "2026-12-01", quantity: 100 },
  ];

  it("რიგი: ადრე ვადაგასული პირველი, ვადის გარეშე — ბოლოს, თანაბარზე — ძველი პარტია", () => {
    assert.deepEqual(fefoOrder(batches).map((b) => b.id), [4, 3, 5, 2, 1]);
  });

  it("ვადაგასული გამოტოვდება, რამდენიმე პარტიაზე ნაწილდება", () => {
    assert.deepEqual(allocateFefo(batches, 350, TODAY), [
      { batchId: 3, quantity: 200 },
      { batchId: 5, quantity: 100 },
      { batchId: 2, quantity: 50 },
    ]);
  });

  it("ვადის დღე ჯერ კიდევ ვარგისია", () => {
    assert.deepEqual(allocateFefo([{ id: 9, expiryDate: TODAY, quantity: 100 }], 100, TODAY), [{ batchId: 9, quantity: 100 }]);
  });

  it("არ ჰყოფნის / 0 — null", () => {
    assert.equal(allocateFefo(batches, 1601, TODAY), null);
    assert.equal(allocateFefo(batches, 0, TODAY), null);
    assert.equal(usableQuantity(batches, TODAY), 1600);
  });
});

describe("ვადა და ნაშთი", () => {
  it("ვადის მდგომარეობა", () => {
    assert.equal(addDaysTo("2026-12-20", 30), "2027-01-19");
    assert.equal(expiryStatus(null, TODAY), "none");
    assert.equal(expiryStatus("2026-10-23", TODAY), "expired");
    assert.equal(expiryStatus(TODAY, TODAY), "expiring");
    assert.equal(expiryStatus("2026-11-23", TODAY), "expiring");
    assert.equal(expiryStatus("2026-11-24", TODAY), "ok");
  });

  it("ნაშთის დონე", () => {
    assert.equal(stockLevel(0, 1000), "out");
    assert.equal(stockLevel(1000, 1000), "low");
    assert.equal(stockLevel(1001, 1000), "ok");
    assert.equal(stockLevel(5, 0), "ok");
  });
});
