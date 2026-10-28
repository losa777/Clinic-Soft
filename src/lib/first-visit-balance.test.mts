import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type FirstVisitDoctor, recommendDoctor, sharePercent } from "./first-visit-balance.ts";

const doc = (doctorId: number, name: string, first: number, all: number, works = true): FirstVisitDoctor => ({ doctorId, name, room: null, first, all, works });

describe("პირველადი პაციენტების დაბალანსება", () => {
  it("რეკომენდებული — ყველაზე ნაკლები პირველადით", () => {
    assert.equal(recommendDoctor([doc(1, "ა", 3, 5), doc(2, "ბ", 1, 6), doc(3, "გ", 2, 2)])?.doctorId, 2);
  });

  it("პირველადი თანაბარია — ნაკლები ვიზიტი ჯამში", () => {
    assert.equal(recommendDoctor([doc(1, "ა", 1, 7), doc(2, "ბ", 1, 3)])?.doctorId, 2);
  });

  it("ამ დღეს არმომუშავე ექიმი არ რეკომენდდება", () => {
    assert.equal(recommendDoctor([doc(1, "ა", 0, 0, false), doc(2, "ბ", 2, 4), doc(3, "გ", 3, 4)])?.doctorId, 2);
  });

  it("ერთი მომუშავე ან ყველა სრულიად თანაბარი — რეკომენდაცია არ არის", () => {
    assert.equal(recommendDoctor([doc(1, "ა", 0, 0), doc(2, "ბ", 0, 0, false)]), null);
    assert.equal(recommendDoctor([doc(1, "ა", 2, 3), doc(2, "ბ", 2, 3)]), null);
  });

  it("წილი პროცენტებში", () => {
    assert.equal(sharePercent(1, 3), 33);
    assert.equal(sharePercent(0, 0), 0);
    assert.equal(sharePercent(2, 2), 100);
  });
});
