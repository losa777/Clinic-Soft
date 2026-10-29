import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOrder } from "./order.ts";

describe("შენახული რიგით დალაგება", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

  it("შენახული რიგი; ახალი (რიგში არმყოფი) — ბოლოს, თავდაპირველი რიგით", () => {
    assert.deepEqual(ids(applyOrder(items, [3, 1], (x) => x.id)), [3, 1, 2, 4]);
  });

  it("რიგში წაშლილი id გამოიტოვება; ცარიელი რიგი — უცვლელი", () => {
    assert.deepEqual(ids(applyOrder(items, [9, 4, 2], (x) => x.id)), [4, 2, 1, 3]);
    assert.deepEqual(ids(applyOrder(items, [], (x) => x.id)), [1, 2, 3, 4]);
  });
});
