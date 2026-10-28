import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallRegistry, type CallTransport } from "./calls.ts";

type Sent = { to: string; event: string; payload: Record<string, unknown> };

/** ყალბი სოკეტ-სერვერი: user-ის ტაბები (socket.id) და გაგზავნილი მოვლენები. */
function setup(opts: { offline?: number[]; dnd?: number[]; ringMs?: number } = {}) {
  const sent: Sent[] = [];
  const records: unknown[][] = [];
  const tabs: Record<number, string[]> = { 1: ["a1"], 2: ["b1", "b2"], 3: ["c1"] };
  const sink = (targets: string[]) => ({
    emit: (event: string, payload: Record<string, unknown>) => {
      for (const to of targets) sent.push({ to, event, payload });
    },
  });
  const transport = {
    toSocket: (id: string) => sink([id]),
    toUser: (userId: number, except?: string) => sink((tabs[userId] ?? []).filter((t) => t !== except)),
    isOnline: (userId: number) => !opts.offline?.includes(userId),
    status: (userId: number) => (opts.dnd?.includes(userId) ? "dnd" : "online"),
    activeUser: async (userId: number) => (userId <= 3 ? { id: userId, firstName: "U", lastName: String(userId), avatar: null } : null),
    record: (...args: unknown[]) => records.push(args),
  } as unknown as CallTransport;
  const calls = new CallRegistry(transport, opts.ringMs ?? 60_000);
  const events = (to: string) => sent.filter((s) => s.to === to).map((s) => `${s.event}${s.payload.reason ? `:${s.payload.reason}` : ""}`);
  return { calls, sent, records, events };
}

const CALL = "call-0001";

describe("ზარები — სიგნალის სერვერი", () => {
  it("დარეკვა → ყველა ტაბში რეკავს; პასუხი → დამრეკს accepted, სხვა ტაბებს elsewhere; სიგნალი მხოლოდ მიბმულ ტაბებს შორის", async () => {
    const { calls, events, sent, records } = setup();
    assert.deepEqual(await calls.invite(1, "a1", { callId: CALL, toUserId: 2 }), { ok: true });
    assert.deepEqual(events("b1"), ["call:incoming"]);
    assert.deepEqual(events("b2"), ["call:incoming"]);

    assert.deepEqual(calls.accept(2, "b2", { callId: CALL }), { ok: true });
    assert.deepEqual(events("a1"), ["call:accepted"]);
    assert.deepEqual(events("b1"), ["call:incoming", "call:ended:elsewhere"]);
    assert.deepEqual(calls.accept(2, "b1", { callId: CALL }), { ok: false, error: "ზარი უკვე დასრულდა" });

    calls.signal(1, "a1", { callId: CALL, signal: { type: "offer", sdp: "v=0" } });
    calls.signal(2, "b1", { callId: CALL, signal: { type: "answer", sdp: "x" } }); // არამიბმული ტაბი — იგნორი
    calls.signal(2, "b2", { callId: CALL, signal: { type: "answer", sdp: "v=0" } });
    calls.signal(2, "b2", { callId: CALL, signal: { type: "bogus" } });
    calls.signal(2, "b2", { callId: CALL, signal: { type: "restart" } });
    assert.deepEqual(
      sent.filter((s) => s.event === "call:signal").map((s) => [s.to, (s.payload.signal as { type: string }).type]),
      [
        ["b2", "offer"],
        ["a1", "answer"],
        ["a1", "restart"],
      ],
    );

    calls.hangup(2, "b2", { callId: CALL });
    assert.deepEqual(events("a1").at(-1), "call:ended:ended");
    assert.equal(calls.size, 0);
    assert.deepEqual(records, [[1, 2, "call_ended", 0]]);
  });

  it("უარყოფა, გაუქმება, უპასუხო (ვადა)", async () => {
    const t = setup();
    await t.calls.invite(1, "a1", { callId: CALL, toUserId: 2 });
    t.calls.decline(2, { callId: CALL });
    assert.deepEqual(t.events("a1"), ["call:ended:declined"]);
    assert.deepEqual(t.records, [[1, 2, "call_declined"]]);

    const c = setup();
    await c.calls.invite(1, "a1", { callId: CALL, toUserId: 2 });
    c.calls.hangup(1, "a1", { callId: CALL });
    assert.deepEqual(c.events("b1").at(-1), "call:ended:cancelled");
    assert.deepEqual(c.records, [[1, 2, "call_missed"]]);

    const m = setup({ ringMs: 10 });
    await m.calls.invite(1, "a1", { callId: CALL, toUserId: 2 });
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(m.events("a1"), ["call:ended:missed"]);
    assert.deepEqual(m.events("b2").at(-1), "call:ended:missed");
    assert.equal(m.calls.size, 0);
  });

  it("დაკავებული, სისტემაში არ არის, «არ შემაწუხოთ», საკუთარ თავს, უცნობი", async () => {
    const { calls } = setup({ offline: [3] });
    await calls.invite(1, "a1", { callId: CALL, toUserId: 2 });
    assert.equal((await calls.invite(3, "c1", { callId: "call-0002", toUserId: 2 })).ok, false);
    assert.deepEqual(await calls.invite(1, "a1", { callId: "call-0003", toUserId: 3 }), { ok: false, error: "თქვენ უკვე ზარში ხართ" });
    assert.deepEqual(await setup({ offline: [3] }).calls.invite(1, "a1", { callId: CALL, toUserId: 3 }), {
      ok: false,
      error: "თანამშრომელი ახლა სისტემაში არ არის",
    });
    assert.equal((await setup({ dnd: [2] }).calls.invite(1, "a1", { callId: CALL, toUserId: 2 })).ok, false);
    assert.equal((await setup().calls.invite(1, "a1", { callId: CALL, toUserId: 1 })).ok, false);
    assert.equal((await setup().calls.invite(1, "a1", { callId: CALL, toUserId: 9 })).ok, false);
    assert.equal((await setup().calls.invite(1, "a1", { callId: "bad id!", toUserId: 2 })).ok, false);
  });

  it("კავშირის გაწყვეტა: პასუხამდე (დამრეკი) — გაუქმება; საუბრისას — მეორე მხარეს disconnected", async () => {
    const r = setup();
    await r.calls.invite(1, "a1", { callId: CALL, toUserId: 2 });
    r.calls.socketGone(2, "b1"); // ვისაც ურეკავენ, მისი ერთი ტაბი — ზარი გრძელდება
    assert.equal(r.calls.size, 1);
    r.calls.socketGone(1, "a1");
    assert.equal(r.calls.size, 0);
    assert.deepEqual(r.records, [[1, 2, "call_missed"]]);

    const a = setup();
    await a.calls.invite(1, "a1", { callId: CALL, toUserId: 2 });
    a.calls.accept(2, "b1", { callId: CALL });
    a.calls.socketGone(2, "b2"); // არამიბმული ტაბი — არაფერი
    assert.equal(a.calls.size, 1);
    a.calls.socketGone(2, "b1");
    assert.deepEqual(a.events("a1").at(-1), "call:ended:disconnected");
    assert.equal(a.records[0]?.[2], "call_ended");
    // ზარის შემდეგ ორივე თავისუფალია
    assert.deepEqual(await a.calls.invite(2, "b1", { callId: "call-0002", toUserId: 1 }), { ok: true });
  });
});
