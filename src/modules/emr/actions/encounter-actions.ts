"use server";

import { z } from "zod";
import { type ActionFailure, type ActionResult, failure, success } from "@/lib/action-result";
import { tbilisiParts, tbilisiToday } from "@/lib/appointment-slots";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { ensureCardNumber } from "@/modules/emr/server/card";
import { EMR_TX, EmrError, emrFailure } from "@/modules/emr/server/errors";

export type StartEncounterResult = { ok: true; message: string; encounterId: number } | ActionFailure;

const idSchema = z.number().int().positive();

/** ჯავშანი, თუ ის ამ ექიმისაა (ექიმი მხოლოდ საკუთარ ჯავშნებს მართავს). */
async function lockOwnAppointment(tx: Prisma.TransactionClient, appointmentId: number, userId: number) {
  const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM appointments WHERE id = ${appointmentId} FOR UPDATE`;
  if (!locked.length) throw new EmrError("ჯავშანი ვერ მოიძებნა");
  const appointment = await tx.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    select: {
      id: true,
      patientId: true,
      status: true,
      startTime: true,
      doctor: { select: { userId: true, specialtyId: true } },
      encounter: { select: { id: true } },
    },
  });
  if (appointment.doctor.userId !== userId) throw new EmrError("ეს ჯავშანი სხვა ექიმისაა");
  return { ...appointment, specialtyId: appointment.doctor.specialtyId };
}

/**
 * „მიღების დაწყება“: ქმნის ვიზიტის ჩანაწერს (თუ ჯერ არ არის) და ჯავშანს გადაიყვანს „მიღებაზე“ — ერთ ტრანზაქციაში,
 * ჯავშნის ჩაკეტვით (ორჯერ დაჭერა/ორი ფანჯარა მეორე ჩანაწერს არ ქმნის). მხოლოდ საკუთარი, დღევანდელი ან გასული ჯავშანი.
 */
export async function startEncounterAction(appointmentId: number): Promise<StartEncounterResult> {
  const me = await requirePermission("emr.edit");
  if (!idSchema.safeParse(appointmentId).success) return failure("ჯავშანი ვერ მოიძებნა");
  const userId = Number(me.id);

  try {
    const encounterId = await prisma.$transaction(async (tx) => {
      const a = await lockOwnAppointment(tx, appointmentId, userId);
      if (a.status === "in_progress" && a.encounter) return a.encounter.id;
      if (a.status !== "booked" && a.status !== "arrived") {
        throw new EmrError("მიღება შეიძლება დაიწყოს მხოლოდ „დაჯავშნილ“ ან „მობრძანდა“ სტატუსზე");
      }
      if (tbilisiParts(a.startTime).date > tbilisiToday()) throw new EmrError("მომავალი დღის ვიზიტის მიღებას ვერ დაიწყებთ");

      const now = new Date();
      const encounter =
        a.encounter ??
        (await tx.encounter.create({
          data: { appointmentId: a.id, patientId: a.patientId, doctorId: userId, specialtyId: a.specialtyId, startedAt: now, updatedAt: now },
          select: { id: true },
        }));
      await tx.appointment.update({ where: { id: a.id }, data: { status: "in_progress", updatedById: userId } });
      await ensureCardNumber(tx, a.patientId);
      await audit({ userId, action: "start", entity: "encounter", entityId: encounter.id, patientId: a.patientId }, tx);
      return encounter.id;
    }, EMR_TX);
    return { ok: true, message: "მიღება დაიწყო", encounterId };
  } catch (error) {
    return emrFailure(error);
  }
}

/** „არ გამოცხადდა“ — საკუთარ ჯავშანზე, ვიზიტის დროის შემდეგ. */
export async function markNoShowAction(appointmentId: number): Promise<ActionResult> {
  const me = await requirePermission("emr.edit");
  if (!idSchema.safeParse(appointmentId).success) return failure("ჯავშანი ვერ მოიძებნა");
  const userId = Number(me.id);

  try {
    await prisma.$transaction(async (tx) => {
      const a = await lockOwnAppointment(tx, appointmentId, userId);
      if (a.status !== "booked" && a.status !== "arrived") throw new EmrError("ამ სტატუსზე „არ გამოცხადდა“ ვერ დაისმება");
      if (a.startTime.getTime() > Date.now()) throw new EmrError("„არ გამოცხადდა“ შეიძლება მხოლოდ ვიზიტის დროის შემდეგ");
      await tx.appointment.update({ where: { id: a.id }, data: { status: "no_show", updatedById: userId } });
      await audit({ userId, action: "no_show", entity: "appointment", entityId: a.id, patientId: a.patientId }, tx);
    }, EMR_TX);
    return success("სტატუსი: არ გამოცხადდა");
  } catch (error) {
    return emrFailure(error);
  }
}
