import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeBody, previewText, snippet, systemText } from "./format.ts";
import { linkify } from "./linkify.ts";
import { dayLabel, lastSeenText, listTime, messageTime } from "./time.ts";

// 2026-10-23 12:00 თბილისით = 08:00 UTC
const now = new Date("2026-10-23T08:00:00Z");

describe("ჩატი — ტექსტი", () => {
  it("ნორმალიზაცია: \\r\\n, საკონტროლო სიმბოლოები, ზედმეტი ხაზები, კიდეები", () => {
    assert.equal(normalizeBody("  ა\r\nბ\u0007​\n\n\n\nგ  "), "ა\nბ\n\nგ");
    assert.equal(normalizeBody("\tტაბი\tრჩება"), "ტაბი\tრჩება");
    assert.equal(normalizeBody("   \n  "), "");
  });

  it("ნაწყვეტი ერთ ხაზად, „…“-ით", () => {
    assert.equal(snippet("ა\nბ   გ"), "ა ბ გ");
    assert.equal(snippet("x".repeat(10), 5), "xxxx…");
  });

  it("სიის ნაწყვეტი: წაშლილი, ფაილი, სისტემური", () => {
    const base = { kind: "text", body: "გამარჯობა", deleted: false, event: null, actorName: "ნინო", targetName: null, attachments: 0 };
    assert.equal(previewText(base), "გამარჯობა");
    assert.equal(previewText({ ...base, deleted: true }), "შეტყობინება წაიშალა");
    assert.equal(previewText({ ...base, body: null, attachments: 2 }), "📎 ფაილი");
    assert.equal(previewText({ ...base, kind: "system", event: "member_left" }), "ნინო გავიდა ჯგუფიდან");
    assert.equal(systemText("member_added", "ნინო", "დავით მაისურაძე", null), "ჯგუფს დაემატა: დავით მაისურაძე");
  });
});

describe("ჩატი — ბმულები", () => {
  it("http/https/www → ბმული, დანარჩენი — ტექსტი", () => {
    assert.deepEqual(linkify("იხ. https://moh.gov.ge/a?b=1 და www.example.ge."), [
      { type: "text", value: "იხ. " },
      { type: "link", value: "https://moh.gov.ge/a?b=1", href: "https://moh.gov.ge/a?b=1" },
      { type: "text", value: " და " },
      { type: "link", value: "www.example.ge", href: "https://www.example.ge" },
      { type: "text", value: "." },
    ]);
  });

  it("javascript:/data: და HTML ბმულად არ იქცევა", () => {
    assert.deepEqual(linkify("javascript:alert(1) <a href=x>"), [{ type: "text", value: "javascript:alert(1) <a href=x>" }]);
  });

  it("ფრჩხილი: დახურვა ბმულს ეკუთვნის მხოლოდ თუ გახსნაც აქვს", () => {
    assert.equal(linkify("(https://x.ge/a)")[1].value, "https://x.ge/a");
    assert.equal(linkify("https://en.wikipedia.org/wiki/A_(B)")[0].value, "https://en.wikipedia.org/wiki/A_(B)");
  });
});

describe("ჩატი — დრო (თბილისი)", () => {
  it("შეტყობინების დრო", () => {
    assert.equal(messageTime("2026-10-23T05:30:00Z"), "09:30");
  });

  it("დღის გამყოფი", () => {
    assert.equal(dayLabel("2026-10-23T05:30:00Z", now), "დღეს");
    // 20:30Z = 00:30 თბილისით (უკვე 23 ოქტომბერი), 19:59Z = 23:59 (ჯერ 22)
    assert.equal(dayLabel("2026-10-22T20:30:00Z", now), "დღეს");
    assert.equal(dayLabel("2026-10-22T19:59:00Z", now), "გუშინ");
    assert.equal(dayLabel("2026-10-22T10:00:00Z", now), "გუშინ");
    assert.equal(dayLabel("2026-03-05T10:00:00Z", now), "5 მარტი");
    assert.equal(dayLabel("2025-12-31T10:00:00Z", now), "31 დეკემბერი 2025");
  });

  it("სიის დრო: დღეს, გუშინ, კვირის დღე, თარიღი", () => {
    assert.equal(listTime("2026-10-23T05:30:00Z", now), "09:30");
    assert.equal(listTime("2026-10-22T05:30:00Z", now), "გუშინ");
    assert.equal(listTime("2026-10-19T05:30:00Z", now), "ორშაბათი");
    assert.equal(listTime("2026-10-01T05:30:00Z", now), "01.10.2026");
  });

  it("ბოლოს იყო", () => {
    assert.equal(lastSeenText("2026-10-23T05:30:00Z", now), "ბოლოს იყო: დღეს 09:30");
    assert.equal(lastSeenText("2026-10-22T14:05:00Z", now), "ბოლოს იყო: გუშინ 18:05");
    assert.equal(lastSeenText("2026-10-01T14:05:00Z", now), "ბოლოს იყო: 01.10.2026 18:05");
    assert.equal(lastSeenText(null, now), "გასულია");
  });
});
