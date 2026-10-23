import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AcceptedMimeType } from "@/lib/patient-schema";

/** ნაგულისხმევი საცავი: პროექტის storage/documents (git-ში არ შედის; public/-ის გარეთაა — ბრაუზერიდან პირდაპირ არ იხსნება). */
// turbopackIgnore: საცავი გაშვებისას იკითხება — build-მა მთელი პროექტი არ უნდა „მიაყოლოს“ სერვერის კოდს
export const DEFAULT_DOCUMENTS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "documents");

/**
 * პაციენტის დოკუმენტების საცავი დისკზე: .env.local-ის DOCUMENTS_DIR, ან თუ ცარიელია — storage/documents პროექტში.
 * ფაილები მხოლოდ ავტორიზებული API-ით იკითხება. ბაზაში ინახება ფარდობითი გზა (`2026/10/<uuid>.jpg`),
 * ამიტომ საქაღალდის გადატანა შეიძლება (ფაილები გადაიტანეთ და შეცვალეთ DOCUMENTS_DIR).
 * საქაღალდის სარეზერვო ასლი ბაზასთან ერთად უნდა კეთდებოდეს.
 */
function documentsRoot(): string {
  return path.resolve(process.env.DOCUMENTS_DIR?.trim() || DEFAULT_DOCUMENTS_DIR);
}

const EXTENSIONS: Record<AcceptedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

/** ფაილის ტიპი შიგთავსის პირველი ბაიტებით (ბრაუზერის მიერ გამოგზავნილ ტიპს არ ვენდობით). */
export function detectMimeType(bytes: Uint8Array): AcceptedMimeType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  return null;
}

/** ფარდობითი გზა → აბსოლუტური; საცავის გარეთ გასვლა (`..`) აკრძალულია. */
function resolveStoragePath(storagePath: string): string {
  const root = documentsRoot();
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep)) throw new Error(`დოკუმენტის გზა საცავის გარეთაა: ${storagePath}`);
  return full;
}

/** ფაილის ჩაწერა ახალი სახელით; აბრუნებს ბაზაში შესანახ ფარდობით გზას. */
export async function storeDocument(bytes: Uint8Array, mimeType: AcceptedMimeType): Promise<string> {
  const now = new Date();
  const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const storagePath = `${dir}/${randomUUID()}.${EXTENSIONS[mimeType]}`;
  const full = resolveStoragePath(storagePath);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, bytes, { flag: "wx" });
  return storagePath;
}

export async function readDocument(storagePath: string): Promise<Buffer> {
  return readFile(/*turbopackIgnore: true*/ resolveStoragePath(storagePath));
}

/** ფაილების წაშლა (ჩავარდნილი შენახვის ან დოკუმენტის წაშლის შემდეგ). შეცდომები მხოლოდ ილოგება. */
export async function removeDocuments(storagePaths: string[]): Promise<void> {
  await Promise.all(
    storagePaths.map((p) =>
      rm(/*turbopackIgnore: true*/ resolveStoragePath(p), { force: true }).catch((err) => console.error("ფაილი ვერ წაიშალა:", p, err)),
    ),
  );
}
