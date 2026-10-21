import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transliterate } from "./transliterate.ts";

describe("transliterate", () => {
  it("სახელი და გვარი, დიდი ასოებით", () => {
    assert.equal(transliterate("ნინო ბერიძე"), "Nino Beridze");
    assert.equal(transliterate("გიორგი"), "Giorgi");
  });

  it("ორასოიანი ბგერები (ჟ ღ შ ჩ ც ძ წ ჭ ხ)", () => {
    assert.equal(transliterate("ჟღშჩცძწჭხ"), "Zhghshchtsdztschkh");
    assert.equal(transliterate("შოთა"), "Shota");
    assert.equal(transliterate("ჭავჭავაძე"), "Chavchavadze");
    assert.equal(transliterate("წერეთელი"), "Tsereteli");
    assert.equal(transliterate("ხატია"), "Khatia");
    assert.equal(transliterate("ღვთისო"), "Ghvtiso");
  });

  it("ერთნაირად გადმოცემული ასოები (თ/ტ, პ/ფ, კ/ქ)", () => {
    assert.equal(transliterate("თამარ"), "Tamar");
    assert.equal(transliterate("ტატო"), "Tato");
    assert.equal(transliterate("ფიქრია"), "Pikria");
    assert.equal(transliterate("ყიფიანი"), "Qipiani");
    assert.equal(transliterate("ჰამლეტ ჯაფარიძე"), "Hamlet Japaridze");
  });

  it("მთელი ანბანი", () => {
    assert.equal(
      transliterate("აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ"),
      "Abgdevztiklmnopzhrstupkghqshchtsdztschkhjh",
    );
  });

  it("ორმაგი სახელი/გვარი დეფისით და ჰარით", () => {
    assert.equal(transliterate("ბერიძე-კაპანაძე"), "Beridze-Kapanadze");
    assert.equal(transliterate("ანა მარია"), "Ana Maria");
    assert.equal(transliterate("ანა - მარია"), "Ana - Maria");
    assert.equal(transliterate("ნინო  ბერიძე"), "Nino  Beridze");
  });

  it("აკრეფის პროცესი: ყოველი შუალედური მდგომარეობა", () => {
    assert.equal(transliterate(""), "");
    assert.equal(transliterate("ნ"), "N");
    assert.equal(transliterate("ნი"), "Ni");
    assert.equal(transliterate("ნინო "), "Nino ");
    assert.equal(transliterate("ნინო ბ"), "Nino B");
    assert.equal(transliterate("ჟ"), "Zh");
    assert.equal(transliterate("ბერიძე-"), "Beridze-");
  });

  it("მთავრული ასოები", () => {
    assert.equal(transliterate("ᲜᲘᲜᲝ"), "Nino");
  });

  it("არაქართული სიმბოლოები უცვლელია", () => {
    assert.equal(transliterate("Nino"), "Nino");
    assert.equal(transliterate("ნინო2"), "Nino2");
    assert.equal(transliterate("ო'ნილ"), "O'nil");
  });
});
