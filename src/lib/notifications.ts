import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatTime, tbilisiParts, tbilisiToday } from "@/lib/appointment-slots";

/**
 * შეტყობინებები (ზარი ზედა პანელში): ექიმს — პაციენტი მობრძანდა, კვლევის შედეგი მზადაა, პროცედურა შესრულდა.
 * ბრაუზერი ყოველ 30 წამში კითხულობს (/api/notifications); ინდექსი: (user_id, read_at, created_at).
 */

type Db = Prisma.TransactionClient;

export type NotificationType = "patient_arrived" | "lab_ready" | "procedure_done" | "inventory_low" | "inventory_expiry" | "issue_new" | "issue_update";

/** შეტყობინების ჩაწერა. ტრანზაქციაში გადაეცით tx — ცვლილებასთან ერთად ჩაიწერება ან ერთად გაუქმდება. */
export async function notify(
  db: Db,
  n: { userId: number | null; type: NotificationType; title: string; body?: string | null; link?: string | null },
) {
  if (!n.userId) return;
  await db.notification.create({
    data: { userId: n.userId, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 500) ?? null, link: n.link ?? null, createdAt: new Date() },
  });
}

/** ექიმს: პაციენტი მობრძანდა (ჯავშანი → „მობრძანდა“, ან ცოცხალი რიგი). მხოლოდ დღევანდელ ვიზიტზე. */
export async function notifyArrival(db: Db, appointmentId: number) {
  const a = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      startTime: true,
      source: true,
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { userId: true } },
    },
  });
  if (!a || tbilisiParts(a.startTime).date !== tbilisiToday()) return;
  await notify(db, {
    userId: a.doctor.userId,
    type: "patient_arrived",
    title: `პაციენტი მობრძანდა: ${a.patient.firstName} ${a.patient.lastName}`,
    body: a.source === "walk_in" ? "ცოცხალი რიგი" : `ჯავშანი ${formatTime(a.startTime)}`,
    link: `/doctor/visits/${appointmentId}`,
  });
}

export type NotificationItem = { id: number; type: string; title: string; body: string | null; link: string | null; read: boolean; at: string };

const NOTIFICATIONS_SHOWN = 15;

/** ბოლო შეტყობინებები და წაუკითხავების რაოდენობა. */
export async function loadNotifications(userId: number): Promise<{ unread: number; items: NotificationItem[] }> {
  const [unread, rows] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: NOTIFICATIONS_SHOWN }),
  ]);
  const today = tbilisiToday();
  return {
    unread,
    items: rows.map((n) => {
      const { date } = tbilisiParts(n.createdAt);
      return {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.readAt !== null,
        at: date === today ? formatTime(n.createdAt) : `${formatDate(date)} ${formatTime(n.createdAt)}`,
      };
    }),
  };
}
