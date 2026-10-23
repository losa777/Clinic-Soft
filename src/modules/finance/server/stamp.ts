import "server-only";
import { prisma } from "@/lib/db";
import { readDocument } from "@/lib/document-storage";
import { STAMP_SETTING_KEY } from "@/modules/finance/settings";

/** კლინიკის ბეჭდის ფაილის გზა (DOCUMENTS_DIR-ში) ან null — ატვირთული არ არის. */
export async function loadStampPath(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: STAMP_SETTING_KEY } });
  return row?.value || null;
}

/** ბეჭდის სურათი (PNG/JPG) ან null (არ არის ან ფაილი ვერ წაიკითხა). */
export async function loadStampBytes(): Promise<Uint8Array | null> {
  const path = await loadStampPath();
  if (!path) return null;
  try {
    return new Uint8Array(await readDocument(path));
  } catch (error) {
    console.error("ბეჭდის ფაილი ვერ წაიკითხა:", path, error);
    return null;
  }
}
