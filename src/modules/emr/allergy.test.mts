import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allergyMatches } from "./allergy.ts";

describe("ალერგიის გაფრთხილება მედიკამენტზე", () => {
  const allergies = ["პენიცილინი", "Ibuprofen", "კივი"];

  it("დასახელება შეიცავს ნივთიერებას (დიდი/პატარა ასოს გარეშე)", () => {
    assert.deepEqual(allergyMatches("პენიცილინი G 1 მლნ ერთ.", allergies), ["პენიცილინი"]);
    assert.deepEqual(allergyMatches("IBUPROFEN 400mg", allergies), ["Ibuprofen"]);
  });

  it("ნივთიერება შეიცავს დასახელებას", () => {
    assert.deepEqual(allergyMatches("პენიცილ", allergies), ["პენიცილინი"]);
  });

  it("დამთხვევა არ არის / ძალიან მოკლე", () => {
    assert.deepEqual(allergyMatches("პარაცეტამოლი", allergies), []);
    assert.deepEqual(allergyMatches("კი", allergies), []);
    assert.deepEqual(allergyMatches("ამოქსიცილინი", []), []);
  });
});
