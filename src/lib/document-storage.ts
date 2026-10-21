import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AcceptedMimeType } from "@/lib/patient-schema";

/**
 * პაციენტის დოკუმენტების საცავი დისკზე. საქაღალდე .env.local-ის DOCUMENTS_DIR-შია
 * და უნდა იყოს პროექტის (და public/-ის) გარეთ: ფაილები მხოლოდ ავტორიზებული API-ით იკითხება.
 * ბაზაში ინახება ფარდობითი გზა (`2026/10/<uuid>.jpg`).
 */
function documentsRoot(): string {
  const dir = process.env.DOCUMENTS_DIR;
  if (!dir) throw new Error("გარემოს ცვლადი DOCUMENTS_DIR არ არის მითითებული (.env.local)");
  return path.resolve(dir);
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
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: "wx" });
  return storagePath;
}

export async function readDocument(storagePath: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storagePath));
}

/** ფაილების წაშლა (ჩავარდნილი შენახვის ან დოკუმენტის წაშლის შემდეგ). შეცდომები მხოლოდ ილოგება. */
export async function removeDocuments(storagePaths: string[]): Promise<void> {
  await Promise.all(
    storagePaths.map((p) =>
      rm(resolveStoragePath(p), { force: true }).catch((err) => console.error("ფაილი ვერ წაიშალა:", p, err)),
    ),
  );
}
