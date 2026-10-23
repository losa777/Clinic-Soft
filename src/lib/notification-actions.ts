"use server";

import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";

const idsSchema = z.union([z.literal("all"), z.array(z.number().int().positive()).max(100)]);

/** შეტყობინებების წაკითხულად მონიშვნა — მხოლოდ საკუთარი. */
export async function markNotificationsReadAction(ids: number[] | "all"): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false };
  await prisma.notification.updateMany({
    where: { userId: Number(me.id), readAt: null, ...(parsed.data === "all" ? {} : { id: { in: parsed.data } }) },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
