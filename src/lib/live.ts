import "server-only";
import { prisma } from "@/lib/db";
import type { LiveEvent, LiveTopic } from "@/lib/live-types";
import { chatServer } from "@/modules/chat/realtime/registry";

/**
 * ცვლილების სიგნალი ყველა შესულ თანამშრომელს (ტრანზაქციის დადასტურების შემდეგ). გვერდი თავად ირჩევს, რომელ თემაზე
 * განახლდეს, და მონაცემებს ჩვეულებრივ, უფლების შემოწმებით კითხულობს. სოკეტ-სერვერის გარეშე (`next dev`) — არაფერს აკეთებს.
 */
export function emitLive(topics: LiveTopic[], doctorUserIds?: (number | null | undefined)[]) {
  const io = chatServer();
  if (!io) return;
  const ids = doctorUserIds?.filter((id): id is number => typeof id === "number");
  const event: LiveEvent = ids?.length ? { topics, doctorUserIds: ids } : { topics };
  io.emit("live:changed", event);
}

/** ჯავშნის ცვლილება: ექიმის რიგი (მისი userId) და ჯავშნების სიები. extra — სხვა თემებიც (მაგ. ინვოისები). */
export async function emitAppointmentChange(appointmentId: number, extra: LiveTopic[] = []) {
  if (!chatServer()) return;
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { doctor: { select: { userId: true } } } });
  emitLive(["appointments", ...extra], [a?.doctor.userId]);
}
