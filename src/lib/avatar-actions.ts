"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { AVATAR_MAX_BYTES } from "@/lib/avatar-url";
import { AvatarError, removeAvatar, saveAvatar } from "@/lib/avatars";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { hasRole } from "@/lib/roles";

/** ვისი ფოტო: საკუთარი (userId-ის გარეშე) ან — ადმინს — ნებისმიერი თანამშრომლის. */
async function target(rawUserId: unknown): Promise<{ me: number; userId: number } | ActionResult> {
  const me = await requireUser();
  const myId = Number(me.id);
  const userId = rawUserId === undefined || rawUserId === null || rawUserId === "" ? myId : Number(rawUserId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return failure("მომხმარებელი ვერ მოიძებნა");
  if (userId !== myId && !hasRole(me, "admin")) return failure("სხვისი ფოტოს შეცვლა შეუძლია მხოლოდ ადმინისტრატორს");
  if (userId !== myId && !(await prisma.user.count({ where: { id: userId } }))) return failure("მომხმარებელი ვერ მოიძებნა");
  return { me: myId, userId };
}

/** ფოტოს ატვირთვა (FormData: file, userId?) — JPG/PNG/WebP, 5 მბ-მდე; ინახება შემცირებული (src/lib/avatars.ts). */
export async function uploadAvatarAction(formData: FormData): Promise<ActionResult> {
  const t = await target(formData.get("userId"));
  if ("ok" in t) return t;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failure("აირჩიეთ ფოტო");
  if (file.size > AVATAR_MAX_BYTES) return failure("ფოტო 5 მბ-ზე დიდია");
  try {
    await saveAvatar(t.userId, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof AvatarError) return failure(error.message);
    throw error;
  }
  await audit({ userId: t.me, action: "avatar_upload", entity: "user", entityId: t.userId });
  // ფოტო ყველა გვერდზე ჩანს (ზედა პანელი, ჩატი, მომხმარებლები)
  revalidatePath("/", "layout");
  return success("ფოტო შენახულია");
}

export async function removeAvatarAction(rawUserId?: number): Promise<ActionResult> {
  const t = await target(rawUserId);
  if ("ok" in t) return t;
  await removeAvatar(t.userId);
  await audit({ userId: t.me, action: "avatar_remove", entity: "user", entityId: t.userId });
  revalidatePath("/", "layout");
  return success("ფოტო წაიშალა");
}
