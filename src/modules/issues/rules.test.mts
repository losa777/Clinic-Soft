import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { availableActions, canDo, canRoute, type IssueActor } from "./rules.ts";
import { issueSchema } from "./schema.ts";

const worker: IssueActor = { userId: 2, isCreator: false, isWorker: true, isManager: false };
const creator: IssueActor = { userId: 1, isCreator: true, isWorker: false, isManager: false };
const outsider: IssueActor = { userId: 3, isCreator: false, isWorker: false, isManager: false };
const manager: IssueActor = { userId: 9, isCreator: false, isWorker: true, isManager: true };

describe("პრობლემები — მოქმედებები სტატუსის მიხედვით", () => {
  it("ახალი: შემსრულებელი იღებს/წყვეტს/უარყოფს; ავტორი — მხოლოდ იხსნის", () => {
    assert.deepEqual(availableActions("new", worker, null), ["take", "resolve", "reject"]);
    assert.deepEqual(availableActions("new", creator, null), ["withdraw"]);
    assert.deepEqual(availableActions("new", outsider, null), []);
  });

  it("მუშავდება: უკვე ჩემზეა — „ავიღე“ აღარ ჩანს, სხვაზეა — შეიძლება გადმოვიბარო", () => {
    assert.equal(canDo("take", "in_progress", worker, worker.userId), false);
    assert.equal(canDo("take", "in_progress", worker, 77), true);
    assert.ok(canDo("wait", "in_progress", worker, worker.userId));
  });

  it("გადაწყდა: ავტორი ადასტურებს ან ხსნის თავიდან; შემსრულებელი — ვეღარაფერს", () => {
    assert.deepEqual(availableActions("resolved", creator, 2), ["confirm", "reopen"]);
    assert.deepEqual(availableActions("resolved", worker, 2), []);
    // ადმინს (manage) შეუძლია დახუროს ავტორის ნაცვლად
    assert.ok(canDo("confirm", "resolved", manager, 2));
  });

  it("დახურული / უარყოფილი — მოქმედება და გადაცემა აღარ არის", () => {
    for (const status of ["closed", "rejected"] as const) {
      assert.deepEqual(availableActions(status, manager, null), [], status);
      assert.equal(canRoute(status, manager), false, status);
    }
    assert.ok(canRoute("new", worker));
    assert.equal(canRoute("new", creator), false);
  });
});

describe("პრობლემები — ფორმის ვალიდაცია", () => {
  const base = { title: "პრინტერი არ ბეჭდავს", categoryId: 1, priority: "normal", location: "", description: "" };

  it("ცარიელი ტექსტი → null; სხვა საიტის მისამართი არ ინახება", () => {
    const ok = issueSchema.parse({ ...base, sourcePath: "/registrar/invoices?x=1" });
    assert.equal(ok.location, null);
    assert.equal(ok.sourcePath, "/registrar/invoices?x=1");
    assert.equal(issueSchema.parse({ ...base, sourcePath: "//evil.example" }).sourcePath, null);
    assert.equal(issueSchema.parse({ ...base, sourcePath: "https://evil.example" }).sourcePath, null);
  });

  it("სათაური და კატეგორია სავალდებულოა", () => {
    assert.equal(issueSchema.safeParse({ ...base, title: " " }).success, false);
    assert.equal(issueSchema.safeParse({ ...base, categoryId: 0 }).success, false);
    assert.equal(issueSchema.safeParse({ ...base, priority: "critical" }).success, false);
  });
});
