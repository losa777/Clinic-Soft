import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { USER_SEARCH_LIMIT } from "@/modules/chat/config";
import { requireActiveUsers } from "@/modules/chat/server/access";
import { type Db, likeEscape } from "@/modules/chat/server/db";
import { toChatUser } from "@/modules/chat/server/dto";
import { ChatError } from "@/modules/chat/server/errors";
import { loadPresence } from "@/modules/chat/server/presence";
import type { ChatContact } from "@/modules/chat/types";

/** თანამშრომლების ძებნა და Favorites. გათიშული თანამშრომელი არსად ჩანს. */

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarVersion: true,
  isActive: true,
  role: { select: { name: true } },
} as const satisfies Prisma.UserSelect;

type ContactRow = Prisma.UserGetPayload<{ select: typeof CONTACT_SELECT }>;

async function toContacts(db: Db, userId: number, rows: ContactRow[], favorites?: Set<number>): Promise<ChatContact[]> {
  const ids = rows.map((r) => r.id);
  const [presence, fav] = await Promise.all([
    loadPresence(db, ids),
    favorites ??
      db.userFavorite
        .findMany({ where: { userId, favoriteUserId: { in: ids } }, select: { favoriteUserId: true } })
        .then((f) => new Set(f.map((x) => x.favoriteUserId))),
  ]);
  return rows.map((r) => ({ ...toChatUser(r), isFavorite: fav.has(r.id), presence: presence.get(r.id)! }));
}

/**
 * ძებნა სახელით, გვარით და როლით: ყოველი სიტყვა ერთ-ერთ ველში უნდა მოიძებნოს („ნინო რეგ“).
 * მთავრული → მხედრული (toLowerCase); utf8mb4_unicode_ci — ლათინურში რეგისტრის მიუხედავად.
 * ცარიელი ძებნა — ყველა აქტიური თანამშრომელი (პირველი USER_SEARCH_LIMIT) გვარით.
 */
export async function searchUsers(db: Db, userId: number, query: string): Promise<ChatContact[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4).map(likeEscape);
  const rows = await db.user.findMany({
    where: {
      isActive: true,
      id: { not: userId },
      AND: words.map((w) => ({
        OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }, { role: { name: { contains: w } } }],
      })),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: USER_SEARCH_LIMIT,
    select: CONTACT_SELECT,
  });
  return toContacts(db, userId, rows);
}

export async function listFavorites(db: Db, userId: number): Promise<ChatContact[]> {
  const rows = await db.userFavorite.findMany({
    where: { userId, favoriteUser: { isActive: true } },
    select: { favoriteUser: { select: CONTACT_SELECT } },
  });
  const users = rows
    .map((r) => r.favoriteUser)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "ka") || a.firstName.localeCompare(b.firstName, "ka"));
  return toContacts(db, userId, users, new Set(users.map((u) => u.id)));
}

export async function addFavorite(db: Db, userId: number, favoriteUserId: number) {
  if (favoriteUserId === userId) throw new ChatError("საკუთარ თავს Favorites-ში ვერ დაამატებთ");
  await requireActiveUsers(db, [favoriteUserId]);
  await db.userFavorite.createMany({ data: [{ userId, favoriteUserId, createdAt: new Date() }], skipDuplicates: true });
}

export async function removeFavorite(db: Db, userId: number, favoriteUserId: number) {
  await db.userFavorite.deleteMany({ where: { userId, favoriteUserId } });
}
