import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_PERMISSIONS, can, DEFAULT_ROLE_PERMISSIONS, type PermissionCode } from "./permissions.ts";
import { routeRedirect } from "./route-access.ts";

const user = (roleCode: string) => ({ roleCode, permissions: (DEFAULT_ROLE_PERMISSIONS as Record<string, PermissionCode[]>)[roleCode] ?? [] });

describe("როლით წვდომა — მარშრუტები (proxy)", () => {
  it("ავტორიზაციის გარეშე → შესვლის გვერდი", () => {
    assert.equal(routeRedirect("/doctor", null), "/login");
    assert.equal(routeRedirect("/lab/anything", undefined), "/login");
    assert.equal(routeRedirect("/login", null), null);
  });

  it("საკუთარი როლის გვერდები — ღიაა", () => {
    assert.equal(routeRedirect("/doctor", "doctor"), null);
    assert.equal(routeRedirect("/doctor/patients/5", "doctor"), null);
    assert.equal(routeRedirect("/lab", "lab"), null);
    assert.equal(routeRedirect("/nurse", "nurse"), null);
  });

  it("სხვა როლის გვერდი → საკუთარ მთავარ გვერდზე", () => {
    assert.equal(routeRedirect("/registrar/invoices", "doctor"), "/doctor");
    assert.equal(routeRedirect("/doctor", "lab"), "/lab");
    assert.equal(routeRedirect("/doctor/encounters/1/prescription", "nurse"), "/nurse");
    assert.equal(routeRedirect("/admin", "registrar"), "/registrar");
    // პრეფიქსის მსგავსება საკმარისი არ არის
    assert.equal(routeRedirect("/doctorx", "doctor"), "/doctor");
  });

  it("ჩატი (/chat) — ყველა შესული როლისთვის; შეუსვლელი → შესვლის გვერდი", () => {
    for (const role of ["admin", "registrar", "doctor", "nurse", "lab", "accountant", "director"]) {
      assert.equal(routeRedirect("/chat", role), null, role);
    }
    assert.equal(routeRedirect("/chat", null), "/login");
    assert.equal(routeRedirect("/chatx", "doctor"), "/doctor");
  });

  it("შესული მომხმარებელი /login-ზე → საკუთარ გვერდზე; API — თავად ამოწმებს", () => {
    assert.equal(routeRedirect("/login", "doctor"), "/doctor");
    assert.equal(routeRedirect("/api/notifications", null), null);
  });
});

describe("როლით წვდომა — უფლებები (ნაგულისხმევი)", () => {
  it("ადმინს ყველა უფლება აქვს", () => {
    for (const p of ALL_PERMISSIONS) assert.ok(can({ roleCode: "admin", permissions: [] }, p), p);
  });

  it("ექიმი: სამედიცინო ჩანაწერი და ხელმოწერა — კი; ფინანსები — არა", () => {
    const d = user("doctor");
    for (const p of ["emr.view", "emr.edit", "documents.sign", "appointments.book"] as const) assert.ok(can(d, p), p);
    for (const p of ["invoices.create", "payments.create", "invoices.cancel", "orders.lab", "orders.nurse", "appointments.manage"] as const) {
      assert.equal(can(d, p), false, p);
    }
  });

  it("რეგისტრატურას სამედიცინო ჩანაწერზე წვდომა არ აქვს", () => {
    const r = user("registrar");
    assert.ok(can(r, "invoices.create"));
    assert.ok(can(r, "appointments.manage"));
    for (const p of ["emr.view", "emr.edit", "documents.sign"] as const) assert.equal(can(r, p), false, p);
  });

  it("ლაბორანტი და ექთანი — მხოლოდ საკუთარი რიგი", () => {
    assert.deepEqual(user("lab").permissions, ["orders.lab"]);
    assert.deepEqual(user("nurse").permissions, ["orders.nurse"]);
    assert.equal(can(user("lab"), "orders.nurse"), false);
    assert.equal(can(user("nurse"), "emr.view"), false);
  });

  it("ბუღალტერი/დირექტორი — მხოლოდ ნახვა და ანგარიშები", () => {
    for (const role of ["accountant", "director"]) {
      const u = user(role);
      assert.ok(can(u, "reports.daily"));
      for (const p of ["invoices.create", "payments.create", "emr.view"] as const) assert.equal(can(u, p), false, `${role}: ${p}`);
    }
  });
});
