import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, buildSlots, isoWeekday, isRealDate, tbilisiParts, tbilisiToDate, tbilisiToday } from "./appointment-slots.ts";

const DATE = "2026-10-22";
const at = (time: string) => new Date(`${DATE}T${time}:00+04:00`);

describe("თბილისის დრო", () => {
  it("თარიღი + წუთები → UTC", () => {
    assert.equal(tbilisiToDate(DATE, 9 * 60 + 30).toISOString(), "2026-10-22T05:30:00.000Z");
    // შუაღამე თბილისში წინა დღის 20:00-ია UTC-ში
    assert.equal(tbilisiToDate(DATE, 0).toISOString(), "2026-10-21T20:00:00.000Z");
  });

  it("UTC → თბილისის თარიღი და დრო", () => {
    assert.deepEqual(tbilisiParts(new Date("2026-10-21T21:15:00Z")), { date: DATE, minutes: 75 });
    assert.equal(tbilisiToday(new Date("2026-10-21T20:00:00Z")), DATE);
    assert.equal(tbilisiToday(new Date("2026-10-21T19:59:00Z")), "2026-10-21");
  });

  it("კვირის დღე: 1 — ორშაბათი, 7 — კვირა", () => {
    assert.equal(isoWeekday("2026-10-19"), 1);
    assert.equal(isoWeekday(DATE), 4);
    assert.equal(isoWeekday("2026-10-25"), 7);
  });

  it("თარიღის შემოწმება და დღეების დამატება", () => {
    assert.equal(isRealDate("2026-02-28"), true);
    assert.equal(isRealDate("2026-02-30"), false);
    assert.equal(isRealDate("22.10.2026"), false);
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });
});

describe("buildSlots", () => {
  const morning = { start: 9 * 60, end: 11 * 60 };
  const early = new Date("2026-10-01T00:00:00Z");

  it("ინტერვალი იყოფა ვიზიტის ხანგრძლივობით, არასრული ბოლო ნაწილი არ ითვლება", () => {
    const slots = buildSlots({ date: DATE, intervals: [{ start: 540, end: 640 }], duration: 30, doctorBusy: [], now: early });
    assert.deepEqual(
      slots.map((s) => s.time),
      ["09:00", "09:30", "10:00"],
    );
    assert.ok(slots.every((s) => s.state === "free"));
    assert.equal(slots[0].start, "2026-10-22T05:00:00.000Z");
  });

  it("ექიმის ჯავშანი — busy, ნაწილობრივი გადაფარვაც", () => {
    const slots = buildSlots({
      date: DATE,
      intervals: [morning],
      duration: 30,
      doctorBusy: [{ start: at("09:45"), end: at("10:15") }],
      now: early,
    });
    assert.deepEqual(
      slots.map((s) => s.state),
      ["free", "busy", "busy", "free"],
    );
  });

  it("ბოლოში მიბჯენილი ჯავშანი არ ითვლება გადაფარვად", () => {
    const slots = buildSlots({
      date: DATE,
      intervals: [morning],
      duration: 30,
      doctorBusy: [{ start: at("09:00"), end: at("09:30") }],
      now: early,
    });
    assert.deepEqual(
      slots.map((s) => s.state),
      ["busy", "free", "free", "free"],
    );
  });

  it("პაციენტის სხვა ჯავშანი — patient; გასული დრო — past (უპირატესია)", () => {
    const slots = buildSlots({
      date: DATE,
      intervals: [morning],
      duration: 30,
      doctorBusy: [],
      patientBusy: [{ start: at("10:00"), end: at("10:20") }],
      now: at("09:30"),
    });
    assert.deepEqual(
      slots.map((s) => s.state),
      ["past", "past", "patient", "free"],
    );
  });

  it("რამდენიმე ინტერვალი დალაგებულია, გადაფარული სლოტი ერთხელ ჩანს", () => {
    const slots = buildSlots({
      date: DATE,
      intervals: [
        { start: 14 * 60, end: 15 * 60 },
        { start: 9 * 60, end: 10 * 60 },
        { start: 9 * 60, end: 10 * 60 },
      ],
      duration: 30,
      doctorBusy: [],
      now: early,
    });
    assert.deepEqual(
      slots.map((s) => s.time),
      ["09:00", "09:30", "14:00", "14:30"],
    );
  });
});
