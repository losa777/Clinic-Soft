import "server-only";
import { readDocument, removeDocuments, storeFile } from "@/lib/document-storage";
import { FILE_MAX_BYTES, FILES_PER_MESSAGE } from "@/modules/chat/config";
import { ALLOWED_LABELS, detectFileType, formatSize, imageSize, safeFileName } from "@/modules/chat/files";
import { requireMember } from "@/modules/chat/server/access";
import type { Db } from "@/modules/chat/server/db";
import { ChatError } from "@/modules/chat/server/errors";

/**
 * ჩატის ფაილები: ინახება DOCUMENTS_DIR/chat/-ში (public-ის გარეთ), გაიცემა მხოლოდ საუბრის მონაწილეს
 * (/api/chat/attachments/[id]). ტიპი მოწმდება შიგთავსით; ფაილი არ იშლება (შეტყობინების წაშლისასაც — აუდიტისთვის).
 */

export type StoredAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  width: number | null;
  height: number | null;
};

/** multipart-ის ფაილები: ჯერ ყველა მოწმდება, შემდეგ იწერება დისკზე. ჩაწერის შეცდომისას უკვე ჩაწერილი იშლება. */
export async function storeUploads(files: File[]): Promise<StoredAttachment[]> {
  if (files.length > FILES_PER_MESSAGE) throw new ChatError(`ერთ შეტყობინებაში მაქსიმუმ ${FILES_PER_MESSAGE} ფაილი`);
  const prepared = [];
  for (const file of files) {
    const name = safeFileName(file.name);
    if (file.size === 0) throw new ChatError(`„${name}“ ცარიელია`);
    if (file.size > FILE_MAX_BYTES) throw new ChatError(`„${name}“ ძალიან დიდია (მაქსიმუმ ${formatSize(FILE_MAX_BYTES)})`, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectFileType(bytes, name);
    if (!type) throw new ChatError(`„${name}“ — ფაილის ტიპი დაშვებული არ არის (${ALLOWED_LABELS})`);
    const size = type.image ? imageSize(bytes, type.mime) : null;
    prepared.push({ bytes, name, type, size });
  }

  const stored: StoredAttachment[] = [];
  try {
    for (const p of prepared) {
      const storagePath = await storeFile(p.bytes, p.type.ext, "chat");
      stored.push({
        fileName: p.name,
        mimeType: p.type.mime,
        size: p.bytes.byteLength,
        storagePath,
        width: p.size?.width ?? null,
        height: p.size?.height ?? null,
      });
    }
  } catch (error) {
    await discardUploads(stored);
    throw error;
  }
  return stored;
}

/** შეტყობინება არ შეიქმნა (შეცდომა / დუბლიკატი) — დისკზე ჩაწერილი ფაილები იშლება. */
export async function discardUploads(stored: StoredAttachment[]) {
  if (stored.length) await removeDocuments(stored.map((s) => s.storagePath));
}

/** ფაილი მხოლოდ საუბრის მონაწილეს; უცხო / წაშლილი შეტყობინების ფაილი — 404. */
export async function readAttachment(db: Db, userId: number, attachmentId: number) {
  const attachment = await db.messageAttachment.findUnique({
    where: { id: BigInt(attachmentId) },
    select: { fileName: true, mimeType: true, size: true, storagePath: true, message: { select: { id: true, conversationId: true, deletedAt: true } } },
  });
  const notFound = () => new ChatError("ფაილი ვერ მოიძებნა", 404);
  if (!attachment || attachment.message.deletedAt) throw notFound();
  const member = await requireMember(db, userId, attachment.message.conversationId).catch(() => {
    throw notFound();
  });
  // საუბარი წაშალა თავისთვის — ძველი ფაილებიც აღარ ჩანს
  if (attachment.message.id <= member.clearedMessageId) throw notFound();
  try {
    return { ...attachment, bytes: await readDocument(attachment.storagePath) };
  } catch (error) {
    console.error("ჩატი: ფაილი დისკზე ვერ მოიძებნა:", attachmentId, error);
    throw notFound();
  }
}
