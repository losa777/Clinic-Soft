import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { presenceStatus } from "./presence.ts";

const MIN = 60_000;
const AWAY = 5 * MIN;
const now = 1_000 * MIN;

describe("ჩატი — სტატუსის წესი", () => {
  it("კავშირი არ არის → გასულია („არ შემაწუხოთ“-ის მიუხედავად)", () => {
    assert.equal(presenceStatus([], null, now, AWAY), "offline");
    assert.equal(presenceStatus([], "dnd", now, AWAY), "offline");
  });

  it("ბოლო 5 წუთში აქტივობა → აქტიური; მეტი → არ არის კომპიუტერთან", () => {
    assert.equal(presenceStatus([now - 4 * MIN], null, now, AWAY), "online");
    assert.equal(presenceStatus([now - AWAY + 1], null, now, AWAY), "online");
    assert.equal(presenceStatus([now - AWAY], null, now, AWAY), "away");
    assert.equal(presenceStatus([now - 30 * MIN], null, now, AWAY), "away");
  });

  it("რამდენიმე ტაბი/კომპიუტერი: ერთში მაინც აქტიური → აქტიური", () => {
    assert.equal(presenceStatus([now - 60 * MIN, now - MIN, now - 20 * MIN], null, now, AWAY), "online");
    assert.equal(presenceStatus([now - 60 * MIN, now - 20 * MIN], null, now, AWAY), "away");
  });

  it("„არ შემაწუხოთ“ ჩანს, სანამ შესულია (აქტივობის მიუხედავად)", () => {
    assert.equal(presenceStatus([now], "dnd", now, AWAY), "dnd");
    assert.equal(presenceStatus([now - 60 * MIN], "dnd", now, AWAY), "dnd");
  });

  it("ზღვარი კონფიგურირებადია", () => {
    assert.equal(presenceStatus([now - 2 * MIN], null, now, MIN), "away");
    assert.equal(presenceStatus([now - 2 * MIN], null, now, 10 * MIN), "online");
  });
});
