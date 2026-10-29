import "server-only";
import { prisma } from "@/lib/db";

/**
 * მომხმარებლის პირადი პარამეტრები (user_preferences): გასაღები → JSON. ბრაუზერის ნაცვლად ბაზაში — ერთ კომპიუტერზე
 * რამდენიმე თანამშრომელი მუშაობს და სხვა კომპიუტერიდან შესვლისასაც უნდა დარჩეს.
 */
export const PREFERENCE_KEYS = {
  /** „პირველადი პაციენტების“ სპეციალობის ბარათების რიგი: specialty id-ების მასივი */
  firstVisitsOrder: "first_visits.order",
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

/** შენახული რიცხვების მასივი (მაგ. რიგი); არ არის ან დაზიანებულია — []. */
export async function loadIdOrder(userId: number, key: PreferenceKey): Promise<number[]> {
  const pref = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key } }, select: { value: true } });
  if (!pref) return [];
  try {
    const value: unknown = JSON.parse(pref.value);
    return Array.isArray(value) ? value.filter((v): v is number => Number.isSafeInteger(v) && v > 0) : [];
  } catch {
    return [];
  }
}

export async function saveIdOrder(userId: number, key: PreferenceKey, ids: number[]) {
  const data = { value: JSON.stringify(ids), updatedAt: new Date() };
  await prisma.userPreference.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, ...data }, update: data });
}
