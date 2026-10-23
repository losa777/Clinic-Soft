import { ALLOWED_FILE_TYPES, type AllowedFileType, FILE_MAX_BYTES, FILES_PER_MESSAGE } from "./config.ts";

/** ჩატის ფაილები: ტიპის ამოცნობა შიგთავსით, სურათის ზომა, ზომის ტექსტი. სუფთა ფუნქციები (სერვერი და ბრაუზერი), ტესტებით. */

const byExt = new Map<string, AllowedFileType>(ALLOWED_FILE_TYPES.map((t) => [t.ext, t]));
const byMime = new Map<string, AllowedFileType>(ALLOWED_FILE_TYPES.map((t) => [t.mime, t]));
byExt.set("jpeg", byMime.get("image/jpeg")!);

export const ACCEPT_ATTRIBUTE = [...ALLOWED_FILE_TYPES.map((t) => `.${t.ext},${t.mime}`), ".jpeg"].join(",");
export const ALLOWED_LABELS = ALLOWED_FILE_TYPES.map((t) => t.label).join(", ");

export function fileTypeOf(mime: string): AllowedFileType | undefined {
  return byMime.get(mime);
}

export function isImageMime(mime: string): boolean {
  return byMime.get(mime)?.image ?? false;
}

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/**
 * ტიპი შიგთავსის პირველი ბაიტებით (ბრაუზერის ტიპს არ ვენდობით). DOCX/XLSX — ZIP არქივია, ამიტომ მათ შორის
 * გაფართოება არჩევს; TXT — სიგნატურა არ აქვს: UTF-8 ტექსტი NUL-ის გარეშე და .txt გაფართოება.
 */
export function detectFileType(bytes: Uint8Array, fileName: string): AllowedFileType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (offset: number, s: string) => [...s].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  if (starts(0xff, 0xd8, 0xff)) return byMime.get("image/jpeg")!;
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return byMime.get("image/png")!;
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return byMime.get("image/gif")!;
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return byMime.get("image/webp")!;
  if (ascii(0, "%PDF-")) return byMime.get("application/pdf")!;
  const ext = extensionOf(fileName);
  if (starts(0x50, 0x4b, 0x03, 0x04) && (ext === "docx" || ext === "xlsx")) return byExt.get(ext)!;
  if (ext === "txt" && !bytes.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return byExt.get("txt")!;
    } catch {
      return null;
    }
  }
  return null;
}

/** სურათის ზომა (სათაურიდან, გაშიფვრის გარეშე): PNG, GIF, JPEG (SOF), WEBP (VP8/VP8L/VP8X). უცნობი — null. */
export function imageSize(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ok = (w: number, h: number) => (w > 0 && h > 0 && w <= 65535 && h <= 65535 ? { width: w, height: h } : null);
  try {
    if (mime === "image/png") return ok(view.getUint32(16), view.getUint32(20));
    if (mime === "image/gif") return ok(view.getUint16(6, true), view.getUint16(8, true));
    if (mime === "image/webp") {
      const chunk = String.fromCharCode(...bytes.slice(12, 16));
      if (chunk === "VP8 ") return ok(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
      if (chunk === "VP8L") {
        const b = view.getUint32(21, true);
        return ok((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
      }
      if (chunk === "VP8X") {
        const w = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
        const h = bytes[27] | (bytes[28] << 8) | (bytes[29] << 16);
        return ok(w + 1, h + 1);
      }
      return null;
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1];
        const length = view.getUint16(i + 2);
        // SOF0–SOF15, გარდა DHT (C4), JPG (C8), DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return ok(view.getUint16(i + 7), view.getUint16(i + 5));
        }
        i += 2 + length;
      }
    }
  } catch {
    // მოკლე / დაზიანებული სათაური
  }
  return null;
}

/** 1536 → „1.5 KB“, 2_400_000 → „2.3 MB“. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** ფაილის სახელი შესანახად: მხოლოდ საბოლოო ნაწილი, საკონტროლო სიმბოლოების გარეშე, მაქსიმუმ 255. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (clean || "ფაილი").slice(-255);
}

/** ბრაუზერში, ატვირთვამდე: ზომა და რაოდენობა (ტიპს საბოლოოდ სერვერი ამოწმებს). აბრუნებს შეცდომის ტექსტს ან null-ს. */
export function checkFiles(files: { name: string; size: number }[], already = 0): string | null {
  if (already + files.length > FILES_PER_MESSAGE) return `ერთ შეტყობინებაში მაქსიმუმ ${FILES_PER_MESSAGE} ფაილი`;
  for (const f of files) {
    if (f.size === 0) return `„${f.name}“ ცარიელია`;
    if (f.size > FILE_MAX_BYTES) return `„${f.name}“ ძალიან დიდია (მაქსიმუმ ${formatSize(FILE_MAX_BYTES)})`;
    if (!byExt.has(extensionOf(f.name))) return `„${f.name}“ — ტიპი დაშვებული არ არის (${ALLOWED_LABELS})`;
  }
  return null;
}
