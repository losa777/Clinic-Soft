import "server-only";
import { readDocument, removeDocuments, storeFile } from "@/lib/document-storage";
import { prisma } from "@/lib/db";
import { FILE_MAX_BYTES } from "@/modules/chat/config";
import { ALLOWED_LABELS, detectFileType, formatSize, safeFileName } from "@/modules/chat/files";
import { ISSUE_FILES_MAX } from "@/modules/issues/labels";
import { type IssueUser, visibleWhere } from "@/modules/issues/server/access";
import { IssueError } from "@/modules/issues/server/db";

/**
 * ბილეთის ფაილები (ფოტო, PDF...): ინახება DOCUMENTS_DIR/issues/-ში (public-ის გარეთ), გაიცემა მხოლოდ მას,
 * ვინც ბილეთს ხედავს (/api/issues/attachments/[id]). ტიპები და ზომა — ჩატის წესებით, ტიპი მოწმდება შიგთავსით.
 */

export type StoredIssueFile = { fileName: string; mimeType: string; size: number; storagePath: string };

/** FormData-ს ფაილები: ჯერ ყველა მოწმდება, შემდეგ იწერება დისკზე. ჩაწერის შეცდომისას უკვე ჩაწერილი იშლება. */
export async function storeIssueFiles(files: File[]): Promise<StoredIssueFile[]> {
  if (files.length > ISSUE_FILES_MAX) throw new IssueError(`მაქსიმუმ ${ISSUE_FILES_MAX} ფაილი`);
  const prepared = [];
  for (const file of files) {
    const name = safeFileName(file.name);
    if (file.size === 0) throw new IssueError(`„${name}“ ცარიელია`);
    if (file.size > FILE_MAX_BYTES) throw new IssueError(`„${name}“ ძალიან დიდია (მაქსიმუმ ${formatSize(FILE_MAX_BYTES)})`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectFileType(bytes, name);
    if (!type) throw new IssueError(`„${name}“ — ფაილის ტიპი დაშვებული არ არის (${ALLOWED_LABELS})`);
    prepared.push({ bytes, name, type });
  }

  const stored: StoredIssueFile[] = [];
  try {
    for (const p of prepared) {
      const storagePath = await storeFile(p.bytes, p.type.ext, "issues");
      stored.push({ fileName: p.name, mimeType: p.type.mime, size: p.bytes.byteLength, storagePath });
    }
  } catch (error) {
    await discardIssueFiles(stored);
    throw error;
  }
  return stored;
}

/** ბილეთი / კომენტარი არ შეიქმნა — დისკზე ჩაწერილი ფაილები იშლება. */
export async function discardIssueFiles(stored: StoredIssueFile[]) {
  if (stored.length) await removeDocuments(stored.map((s) => s.storagePath));
}

/** ფაილი მხოლოდ ბილეთის მნახველს; სხვა შემთხვევაში — 404 (არსებობაც არ ჩანს). */
export async function readIssueFile(u: IssueUser, attachmentId: number) {
  const file = await prisma.issueAttachment.findFirst({
    where: { id: attachmentId, issue: visibleWhere(u) },
    select: { fileName: true, mimeType: true, storagePath: true },
  });
  if (!file) return null;
  try {
    return { ...file, bytes: await readDocument(file.storagePath) };
  } catch (error) {
    console.error("პრობლემები: ფაილი დისკზე ვერ მოიძებნა:", attachmentId, error);
    return null;
  }
}
