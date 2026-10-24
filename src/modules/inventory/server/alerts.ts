import "server-only";
import { addDays, formatDate, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { FULL_ACCESS_ROLE } from "@/lib/permissions";
import { userWithRole } from "@/lib/user-roles";
import { notify } from "@/lib/notifications";
import { INVENTORY_ROUTES, inventoryRoutesFor, itemUrl } from "@/modules/inventory/routes";
import { EXPIRY_WARNING_DAYS, formatQuantity } from "@/modules/inventory/stock";
import type { Db } from "./db";

/**
 * გაფრთხილებები (ზარი): საწყობის მმართველებს (ადმინი + inventory.manage უფლების როლები) —
 * ნაშთი მინიმუმს ჩამოსცდა (გახარჯვისას, იმავე ტრანზაქციაში) და ვადა იწურება (დღეში ერთხელ, ტაიმერით).
 */

async function managers(db: Db): Promise<{ id: number; roleCode: string }[]> {
  // მთავარი ან დამატებითი როლით (user_roles); ბმულისთვის — ის როლი, რომელსაც საწყობის გვერდი აქვს (საწყობი → ადმინი → სხვა)
  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...userWithRole({ OR: [{ code: FULL_ACCESS_ROLE }, { permissions: { some: { permission: { code: "inventory.manage" } } } }] }),
    },
    select: { id: true, role: { select: { code: true } }, extraRoles: { select: { role: { select: { code: true } } } } },
  });
  return users.map((u) => {
    const codes = [u.role.code, ...u.extraRoles.map((r) => r.role.code)];
    return { id: u.id, roleCode: Object.keys(INVENTORY_ROUTES).find((code) => codes.includes(code)) ?? u.role.code };
  });
}

/** ნაშთი ზღვარს ქვემოთ ჩამოვიდა (მხოლოდ გადაკვეთისას — ყოველ გახარჯვაზე არა). */
export async function notifyLowStock(
  db: Db,
  item: { id: number; name: string; unit: string },
  before: number,
  after: number,
  minQuantity: number,
) {
  if (minQuantity <= 0 || before <= minQuantity || after > minQuantity) return;
  const title = after <= 0 ? `ამოიწურა: ${item.name}` : `მცირე ნაშთი: ${item.name}`;
  for (const m of await managers(db)) {
    const routes = inventoryRoutesFor(m.roleCode);
    await notify(db, {
      userId: m.id,
      type: "inventory_low",
      title,
      body: `ნაშთი: ${formatQuantity(after)} ${item.unit} (მინიმუმი ${formatQuantity(minQuantity)})`,
      link: routes ? itemUrl(routes, item.id) : null,
    });
  }
}

const EXPIRY_NOTIFIED_KEY = "inventory_expiry_notified_on";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 90 * 1000;

/** დღეში ერთხელ: რამდენ პარტიას აქვს ვადა გასული / იწურება 30 დღეში (ნაშთით). */
export async function checkExpiry(): Promise<void> {
  const today = tbilisiToday();
  const done = await prisma.setting.findUnique({ where: { key: EXPIRY_NOTIFIED_KEY } });
  if (done?.value === today) return;
  const [row] = await prisma.$queryRaw<{ expired: bigint; expiring: bigint; nearest: Date | string | null }[]>`
    SELECT SUM(b.expiry_date < ${today}) AS expired,
           SUM(b.expiry_date >= ${today} AND b.expiry_date <= ${addDays(today, EXPIRY_WARNING_DAYS)}) AS expiring,
           MIN(CASE WHEN b.expiry_date >= ${today} THEN b.expiry_date END) AS nearest
    FROM inventory_batches b
    WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL
  `;
  const expired = Number(row?.expired ?? 0);
  const expiring = Number(row?.expiring ?? 0);
  if (expired + expiring > 0) {
    const parts = [
      expired ? `ვადაგასული: ${expired} პარტია (ჩამოსაწერია)` : null,
      expiring ? `${EXPIRY_WARNING_DAYS} დღეში იწურება: ${expiring} პარტია` : null,
    ].filter(Boolean);
    const nearest = row?.nearest ? (row.nearest instanceof Date ? row.nearest.toISOString().slice(0, 10) : String(row.nearest).slice(0, 10)) : null;
    await prisma.$transaction(async (tx) => {
      for (const m of await managers(tx)) {
        const routes = inventoryRoutesFor(m.roleCode);
        await notify(tx, {
          userId: m.id,
          type: "inventory_expiry",
          title: "საწყობი: ვარგისიანობის ვადა",
          body: `${parts.join("; ")}${nearest ? `. უახლოესი: ${formatDate(nearest)}` : ""}`,
          link: routes ? `${routes.stock}?status=expiry` : null,
        });
      }
    });
  }
  await prisma.setting.upsert({ where: { key: EXPIRY_NOTIFIED_KEY }, create: { key: EXPIRY_NOTIFIED_KEY, value: today }, update: { value: today } });
}

const TIMER = Symbol.for("clinic-soft.inventory.expiry.timer");
type GlobalWithTimer = typeof globalThis & { [TIMER]?: ReturnType<typeof setInterval> };

/** ტაიმერი (instrumentation.ts): საათში ერთხელ ამოწმებს, გაფრთხილება — დღეში ერთხელ. */
export function startExpiryScheduler() {
  const g = globalThis as GlobalWithTimer;
  if (g[TIMER]) return;
  const check = () => void checkExpiry().catch((error) => console.error("საწყობი: ვადების შემოწმება ვერ შესრულდა:", error));
  g[TIMER] = setInterval(check, CHECK_INTERVAL_MS);
  g[TIMER].unref?.();
  setTimeout(check, FIRST_CHECK_MS).unref?.();
}
