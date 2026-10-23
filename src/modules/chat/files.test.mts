import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FILE_MAX_BYTES, FILES_PER_MESSAGE } from "./config.ts";
import { checkFiles, detectFileType, formatSize, imageSize, safeFileName } from "./files.ts";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

/** PNG: სიგნატურა + IHDR (სიგანე, სიმაღლე — big endian). */
const png = (w: number, h: number) =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR", [w >> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255], [h >> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255]);

describe("ჩატი — ფაილის ტიპი შიგთავსით", () => {
  it("სურათები და PDF — სიგნატურით, სახელის მიუხედავად", () => {
    assert.equal(detectFileType(png(10, 10), "photo.txt")?.mime, "image/png");
    assert.equal(detectFileType(bytes([0xff, 0xd8, 0xff, 0xe0]), "a.bin")?.mime, "image/jpeg");
    assert.equal(detectFileType(bytes("GIF89a", [1, 0, 1, 0]), "a.gif")?.mime, "image/gif");
    assert.equal(detectFileType(bytes("RIFF", [0, 0, 0, 0], "WEBP"), "a.webp")?.mime, "image/webp");
    assert.equal(detectFileType(bytes("%PDF-1.7"), "ცნობა.pdf")?.mime, "application/pdf");
  });

  it("DOCX/XLSX — ZIP + გაფართოება; სხვა ZIP — უარყოფილი", () => {
    const zip = bytes([0x50, 0x4b, 0x03, 0x04, 0, 0]);
    assert.equal(detectFileType(zip, "ანგარიში.xlsx")?.ext, "xlsx");
    assert.equal(detectFileType(zip, "წერილი.DOCX")?.ext, "docx");
    assert.equal(detectFileType(zip, "archive.zip"), null);
  });

  it("TXT — მხოლოდ UTF-8 ტექსტი .txt-ით; შესრულებადი / HTML — უარყოფილი", () => {
    assert.equal(detectFileType(new TextEncoder().encode("გამარჯობა"), "notes.txt")?.ext, "txt");
    assert.equal(detectFileType(bytes([0x4d, 0x5a, 0x90, 0]), "virus.txt"), null);
    assert.equal(detectFileType(bytes([0xff, 0xfe, 0xc0]), "bad.txt"), null);
    assert.equal(detectFileType(bytes("<html><script>"), "page.html"), null);
    assert.equal(detectFileType(bytes("MZ"), "setup.exe"), null);
  });
});

describe("ჩატი — სურათის ზომა", () => {
  it("PNG / GIF", () => {
    assert.deepEqual(imageSize(png(1920, 1080), "image/png"), { width: 1920, height: 1080 });
    assert.deepEqual(imageSize(bytes("GIF89a", [0x40, 0x01, 0xf0, 0x00]), "image/gif"), { width: 320, height: 240 });
  });

  it("JPEG — SOF ჩანაწერიდან (APP0-ის გამოტოვებით)", () => {
    const jpeg = bytes([0xff, 0xd8], [0xff, 0xe0, 0x00, 0x04, 0, 0], [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0]);
    assert.deepEqual(imageSize(jpeg, "image/jpeg"), { width: 800, height: 600 });
  });

  it("დაზიანებული სათაური — null (შეცდომის გარეშე)", () => {
    assert.equal(imageSize(bytes([0x89, 0x50]), "image/png"), null);
    assert.equal(imageSize(bytes([0xff, 0xd8, 0x00]), "image/jpeg"), null);
  });
});

describe("ჩატი — ფაილების ლიმიტები", () => {
  it("ზომა, რაოდენობა, ტიპი გაფართოებით", () => {
    assert.equal(checkFiles([{ name: "a.pdf", size: 100 }]), null);
    assert.equal(checkFiles([{ name: "a.JPEG", size: 100 }]), null);
    assert.match(checkFiles([{ name: "big.pdf", size: FILE_MAX_BYTES + 1 }])!, /ძალიან დიდია/);
    assert.match(checkFiles([{ name: "empty.pdf", size: 0 }])!, /ცარიელია/);
    assert.match(checkFiles([{ name: "a.exe", size: 10 }])!, /დაშვებული არ არის/);
    assert.match(checkFiles([{ name: "a.pdf", size: 1 }], FILES_PER_MESSAGE)!, /მაქსიმუმ/);
  });

  it("ფაილის სახელი: გზის გარეშე, საკონტროლო სიმბოლოების გარეშე", () => {
    assert.equal(safeFileName("C:\\fakepath\\..\\ანალიზი.pdf"), "ანალიზი.pdf");
    assert.equal(safeFileName("../../etc/passwd"), "passwd");
    assert.equal(safeFileName('a"\u0000b.txt'), "ab.txt");
    assert.equal(safeFileName(""), "ფაილი");
  });

  it("ზომის ტექსტი", () => {
    assert.equal(formatSize(512), "512 B");
    assert.equal(formatSize(1536), "1.5 KB");
    assert.equal(formatSize(10 * 1024 * 1024), "10.0 MB");
  });
});
