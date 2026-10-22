import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcLine,
  cashChange,
  checkCardReference,
  checkPayment,
  checkRefund,
  fromTetri,
  invoiceDebt,
  invoiceStatus,
  netPaid,
  percentOf,
  resolveCoverage,
  shiftDifference,
  shiftExpectedCash,
  sumLines,
  toTetri,
} from "./calc.ts";

describe("თანხები თეთრებში", () => {
  it("სტრიქონი ↔ თეთრი", () => {
    assert.equal(toTetri("12.5"), 1250);
    assert.equal(toTetri("12,05"), 1205);
    assert.equal(toTetri("0"), 0);
    assert.equal(toTetri(819.03), 81903);
    assert.equal(fromTetri(81903), "819.03");
    assert.equal(fromTetri(5), "0.05");
    assert.equal(fromTetri(-150), "-1.50");
    assert.throws(() => toTetri("12.345"));
    assert.throws(() => toTetri("abc"));
  });

  it("პროცენტი, დამრგვალება თეთრამდე (0.5 — ზევით), float-ის ცდომილების გარეშე", () => {
    assert.equal(percentOf(1001, 50), 501); // 5.005 → 5.01
    assert.equal(percentOf(1000, "33.33"), 333);
    assert.equal(percentOf(999, 10), 100); // 0.999 → 1.00
    assert.equal(percentOf(0, 80), 0);
    assert.equal(percentOf(1_000_000_000_000, 100), 1_000_000_000_000); // DECIMAL(12,2)-ის მაქსიმუმთან ახლოს
    assert.throws(() => percentOf(100, 101));
  });
});

describe("ინვოისის ხაზი: დაზღვევის წილი", () => {
  it("დაზღვევის გარეშე — ყველაფერს პაციენტი იხდის", () => {
    assert.deepEqual(calcLine({ unitPrice: 5000, quantity: 2, discountPercent: 0, coverage: null }), {
      gross: 10000,
      discount: 0,
      total: 10000,
      insurance: 0,
      patient: 10000,
    });
  });

  it("70% დაფარვა, ლიმიტის გარეშე", () => {
    const line = calcLine({ unitPrice: 8000, quantity: 1, discountPercent: 0, coverage: { percent: "70", limit: null } });
    assert.equal(line.insurance, 5600);
    assert.equal(line.patient, 2400);
    assert.equal(line.insurance + line.patient, line.total);
  });

  it("ლიმიტი ერთეულზე: დაზღვევა ლიმიტზე მეტს არ ფარავს, ლიმიტი რაოდენობაზე მრავლდება", () => {
    const one = calcLine({ unitPrice: 20000, quantity: 1, discountPercent: 0, coverage: { percent: "80", limit: "100" } });
    assert.equal(one.insurance, 10000); // 80% = 160 ₾, ლიმიტი 100 ₾
    assert.equal(one.patient, 10000);
    const three = calcLine({ unitPrice: 20000, quantity: 3, discountPercent: 0, coverage: { percent: "80", limit: "100" } });
    assert.equal(three.insurance, 30000);
    assert.equal(three.patient, 30000);
    // ლიმიტი პროცენტზე მეტია — მოქმედებს პროცენტი
    const under = calcLine({ unitPrice: 5000, quantity: 1, discountPercent: 0, coverage: { percent: "80", limit: "100" } });
    assert.equal(under.insurance, 4000);
  });

  it("ფასდაკლება — დაზღვევის წილამდე", () => {
    const line = calcLine({ unitPrice: 10000, quantity: 1, discountPercent: "10", coverage: { percent: "50", limit: null } });
    assert.deepEqual(line, { gross: 10000, discount: 1000, total: 9000, insurance: 4500, patient: 4500 });
  });

  it("100% დაფარვა და 0% დაფარვა", () => {
    assert.equal(calcLine({ unitPrice: 3333, quantity: 1, discountPercent: 0, coverage: { percent: "100", limit: null } }).patient, 0);
    assert.equal(calcLine({ unitPrice: 3333, quantity: 1, discountPercent: 0, coverage: { percent: "0", limit: null } }).patient, 3333);
  });

  it("ინვოისის ჯამი", () => {
    const lines = [
      calcLine({ unitPrice: 8000, quantity: 1, discountPercent: 0, coverage: { percent: "70", limit: null } }),
      calcLine({ unitPrice: 2500, quantity: 2, discountPercent: "20", coverage: null }),
    ];
    assert.deepEqual(sumLines(lines), { total: 12000, discount: 1000, insurance: 5600, patient: 6400 });
  });

  it("პირობის არჩევა: სერვისის პირობა უპირატესია კატეგორიისაზე", () => {
    const contracts = [
      { serviceId: null, categoryId: 1, percent: "50", limit: null },
      { serviceId: 7, categoryId: null, percent: "90", limit: "40" },
    ];
    assert.deepEqual(resolveCoverage(contracts, { id: 7, categoryId: 1 }), { percent: "90", limit: "40" });
    assert.deepEqual(resolveCoverage(contracts, { id: 8, categoryId: 1 }), { percent: "50", limit: null });
    assert.equal(resolveCoverage(contracts, { id: 9, categoryId: 2 }), null);
    assert.equal(resolveCoverage(contracts, { id: 9, categoryId: null }), null);
  });
});

describe("გადახდები", () => {
  it("ნაწილობრივი გადახდა: სტატუსი და ვალი", () => {
    const patient = 6400;
    assert.equal(invoiceStatus(patient, 0), "unpaid");
    assert.equal(invoiceStatus(patient, 2000), "partial");
    assert.equal(invoiceDebt(patient, 2000), 4400);
    assert.equal(invoiceStatus(patient, 6400), "paid");
    assert.equal(invoiceDebt(patient, 6400), 0);
    // მთლიანად დაზღვეული ინვოისი (პაციენტის წილი 0) — გადახდილია
    assert.equal(invoiceStatus(0, 0), "paid");
  });

  it("ზედმეტი გადახდა არ მიიღება", () => {
    assert.equal(checkPayment(4400, 4400), null);
    assert.match(checkPayment(4400, 4401)!, /აღემატება/);
    assert.match(checkPayment(0, 100)!, /უკვე გადახდილია/);
    assert.match(checkPayment(100, 0)!, /0-ზე მეტი/);
  });

  it("ნაღდი: ხურდა", () => {
    assert.deepEqual(cashChange(4400, 5000), { ok: true, change: 600 });
    assert.deepEqual(cashChange(4400, 4400), { ok: true, change: 0 });
    assert.equal(cashChange(4400, 4000).ok, false);
  });

  it("დაბრუნება: წმინდა გადახდილი, მეთოდის მიხედვით ლიმიტი", () => {
    const payments = [
      { type: "payment" as const, amount: 3000 },
      { type: "payment" as const, amount: 2000 },
      { type: "refund" as const, amount: 1000 },
    ];
    assert.equal(netPaid(payments), 4000);
    assert.equal(checkRefund(4000, 4000), null);
    assert.match(checkRefund(4001, 4000)!, /აღემატება/);
    assert.match(checkRefund(1500, 4000, 1000)!, /ამ მეთოდით/);
    assert.match(checkRefund(100, 0)!, /არ არის/);
    // დაბრუნების შემდეგ ინვოისი ისევ ნაწილობრივ გადახდილია
    assert.equal(invoiceStatus(5000, netPaid(payments)), "partial");
  });

  it("ბარათი: სრული ნომერი არ მიიღება", () => {
    assert.equal(checkCardReference("1234"), null);
    assert.equal(checkCardReference("RRN 123456789012"), null);
    assert.equal(checkCardReference(""), null);
    assert.match(checkCardReference("4111 1111 1111 1111")!, /სრული ნომერი/);
    assert.match(checkCardReference("4111-1111-1111-1")!, /სრული ნომერი/);
    assert.ok(checkCardReference("ნომერი"));
  });
});

describe("სალაროს ცვლა", () => {
  it("მოსალოდნელი ნაღდი და სხვაობა", () => {
    const expected = shiftExpectedCash(10000, 54000, 4000);
    assert.equal(expected, 60000);
    assert.equal(shiftDifference(60000, expected), 0);
    assert.equal(shiftDifference(59500, expected), -500); // დანაკლისი
    assert.equal(shiftDifference(60200, expected), 200); // ზედმეტი
  });
});
