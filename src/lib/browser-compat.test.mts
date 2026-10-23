import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { randomId, uuidFromBytes } from "./browser-compat.ts";

describe("http-ზე (არადაცული გვერდი) — UUID", () => {
  it("სათადარიგო UUID v4 სწორი ფორმატისაა (სერვერი z.uuid()-ით ამოწმებს)", () => {
    for (const fill of [0x00, 0xff, 0x5a]) {
      const id = uuidFromBytes(new Uint8Array(16).fill(fill));
      assert.ok(z.uuid().safeParse(id).success, id);
      assert.equal(id[14], "4", "ვერსია 4");
    }
  });

  it("crypto.randomUUID-ის გარეშეც მუშაობს და ყოველ ჯერზე სხვაა", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const a = randomId();
      const b = randomId();
      assert.ok(z.uuid().safeParse(a).success);
      assert.notEqual(a, b);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
