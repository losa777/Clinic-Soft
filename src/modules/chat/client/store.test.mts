import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage, ConversationSummary } from "../types.ts";
import { RateLimiter } from "../rate-limit.ts";
import { mergeMessages, sortConversations } from "./store.ts";

const conv = (id: number, activityAt: string, pinned = false) => ({ id, activityAt, pinned }) as ConversationSummary;
const msg = (id: number, body = `#${id}`) => ({ id, body }) as ChatMessage;

describe("ჩატი — საუბრების დალაგება", () => {
  it("ჩამაგრებული პირველი, შემდეგ ბოლო აქტივობა, თანაბარზე — ახალი id", () => {
    const list = {
      1: conv(1, "2026-10-23T08:00:00Z"),
      2: conv(2, "2026-10-23T09:00:00Z"),
      3: conv(3, "2026-10-20T08:00:00Z", true),
      4: conv(4, "2026-10-23T09:00:00Z"),
    };
    assert.deepEqual(sortConversations(list), [3, 4, 2, 1]);
  });
});

describe("ჩატი — შეტყობინებების შერწყმა", () => {
  it("id-ით: დუბლიკატი არ ჩნდება, განახლებული ცვლის ძველს, რიგი ზრდადია", () => {
    const merged = mergeMessages([msg(1), msg(3)], [msg(2), msg(3, "შეცვლილი"), msg(5)]);
    assert.deepEqual(merged.map((m) => [m.id, m.body]), [
      [1, "#1"],
      [2, "#2"],
      [3, "შეცვლილი"],
      [5, "#5"],
    ]);
  });

  it("ცარიელი შემოსული — იგივე მასივი (state არ იცვლება)", () => {
    const current = [msg(1)];
    assert.equal(mergeMessages(current, []), current);
  });
});

describe("ჩატი — rate limit", () => {
  it("capacity მოქმედება, შემდეგ უარი; დრო გავიდა — ივსება; მომხმარებლები ცალ-ცალკე", () => {
    const limiter = new RateLimiter(3, 3_000);
    const t = 1_000_000;
    assert.deepEqual([1, 2, 3, 4].map(() => limiter.take("a", t)), [true, true, true, false]);
    assert.equal(limiter.take("b", t), true, "სხვა მომხმარებელი");
    assert.equal(limiter.take("a", t + 999), false);
    assert.equal(limiter.take("a", t + 1_000), true, "1 წამში — 1 ახალი");
    assert.equal(limiter.take("a", t + 1_001), false);
  });
});
