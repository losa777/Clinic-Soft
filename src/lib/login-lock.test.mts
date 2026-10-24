import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCK_WINDOW_MS, lockedUntil, minutesLeft } from "./login-lock.ts";

const now = new Date("2026-10-24T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

describe("შესვლის დაბლოკვა", () => {
  it("ზღვარამდე — არ იბლოკება", () => {
    assert.equal(lockedUntil([ago(1), ago(2), ago(3), ago(4)], 5, now), null);
  });

  it("5 ცდა 15 წუთში — ბლოკი ბოლო ცდიდან 15 წუთი", () => {
    const until = lockedUntil([ago(10), ago(8), ago(5), ago(3), ago(1)], 5, now);
    assert.equal(until?.getTime(), ago(1).getTime() + LOCK_WINDOW_MS);
    assert.equal(minutesLeft(until!, now), 14);
  });

  it("15 წუთზე ძველი ცდები არ ითვლება", () => {
    assert.equal(lockedUntil([ago(20), ago(18), ago(16), ago(3), ago(1)], 5, now), null);
  });

  it("წარმატებული შესვლის / განბლოკვის შემდეგ ათვლა თავიდან", () => {
    const failures = [ago(10), ago(9), ago(8), ago(7), ago(6)];
    assert.ok(lockedUntil(failures, 5, now));
    assert.equal(lockedUntil(failures, 5, now, ago(6.5)), null);
  });

  it("ბლოკის ვადა გავიდა", () => {
    const failures = [ago(29), ago(28), ago(27), ago(26), ago(15.5)];
    assert.equal(lockedUntil(failures, 5, now), null);
  });
});
