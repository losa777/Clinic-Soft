import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AVATAR_SIZES, type AvatarSize } from "@/lib/avatar-url";
import { prisma } from "@/lib/db";
import { documentsRoot } from "@/lib/document-storage";

/**
 * პროფილის ფოტოები: საცავის avatars/ საქაღალდეში (DOCUMENTS_DIR — სარეზერვო ასლი მასთან ერთად), ორი ზომა WebP-ად:
 * <userId>-64.webp (სიები, ჩატი) და <userId>-256.webp (პროფილი). ორიგინალი არ ინახება; სურათი თავიდან იწერება —
 * მეტამონაცემები (EXIF, GPS) და ფაილში დამალული სხვა შიგთავსი არ რჩება. ბაზაში — მხოლოდ users.avatar_version.
 */

const dir = () => path.join(documentsRoot(), "avatars");
const file = (userId: number, size: AvatarSize) => path.join(dir(), `${userId}-${size}.webp`);

/** სურათის ტიპი პირველი ბაიტებით (ბრაუზერის ტიპს არ ვენდობით): JPG, PNG, WebP. */
export function isAvatarImage(bytes: Uint8Array): boolean {
  const starts = (offset: number, ...sig: number[]) => sig.every((b, i) => bytes[offset + i] === b);
  return (
    starts(0, 0xff, 0xd8, 0xff) ||
    starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50)) // RIFF....WEBP
  );
}

export class AvatarError extends Error {}

/** ფოტოს შენახვა: კვადრატად მოჭრა (სახეზე/მთავარ ობიექტზე ორიენტირებით), ორი ზომა. აბრუნებს ახალ ვერსიას. */
export async function saveAvatar(userId: number, bytes: Uint8Array): Promise<number> {
  if (!isAvatarImage(bytes)) throw new AvatarError("ფაილი უნდა იყოს სურათი: JPG, PNG ან WebP");
  let images: Buffer[];
  try {
    // rotate() — ტელეფონის ფოტოს ორიენტაცია (EXIF) სწორდება; limitInputPixels — ზედმეტად დიდი სურათი არ იხსნება
    const source = sharp(bytes, { limitInputPixels: 50_000_000 }).rotate();
    images = await Promise.all(
      AVATAR_SIZES.map((size) => source.clone().resize(size, size, { fit: "cover", position: "attention" }).webp({ quality: 82 }).toBuffer()),
    );
  } catch {
    throw new AvatarError("სურათი ვერ წაიკითხა — სცადეთ სხვა ფაილი");
  }
  await mkdir(dir(), { recursive: true });
  await Promise.all(AVATAR_SIZES.map((size, i) => writeFile(file(userId, size), images[i])));
  // ვერსია — წამები: წაშლის და ხელახლა ატვირთვის შემდეგაც ახალია (ბრაუზერი ძველ ფოტოს ქეშიდან არ აჩვენებს)
  const version = Math.floor(Date.now() / 1000);
  await prisma.user.update({ where: { id: userId }, data: { avatarVersion: version } });
  return version;
}

export async function removeAvatar(userId: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { avatarVersion: null } });
  await Promise.all(AVATAR_SIZES.map((size) => rm(file(userId, size), { force: true })));
}

/** ფაილი API-სთვის; არ არის — null. */
export async function readAvatar(userId: number, size: AvatarSize): Promise<Buffer | null> {
  try {
    return await readFile(file(userId, size));
  } catch {
    return null;
  }
}
