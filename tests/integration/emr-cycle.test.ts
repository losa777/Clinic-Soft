/**
 * ინტეგრაციული ტესტები რეალურ ბაზაზე (.env.local): ექიმის სრული ციკლი, ჩაკეტილი ჩანაწერი, ცოცხალი რიგი.
 * ყოველი ტესტი ერთ ტრანზაქციაშია და ბოლოს უქმდება (ROLLBACK) — ბაზაში არაფერი რჩება.
 * გაშვება: npm run test:integration  (საჭიროა: npm run db:setup და npm run db:seed — ექიმი „doctor“, სერვისები, ICD-10).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { completeEncounter, loadCompletionPreview } from "@/modules/emr/server/completion";
import { EmrError } from "@/modules/emr/server/errors";
import { lockOwnDraftDocument, ownDraftEncounter } from "@/modules/emr/server/guards";
import { formatMeasurementsOf, loadEncounterMeasurements, saveEncounterMeasurements } from "@/modules/emr/server/measurements";
import { createInvoice } from "@/modules/finance/server/invoices";

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

/** ტესტი ტრანზაქციაში, რომელიც ბოლოს ყოველთვის უქმდება. */
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { maxWait: 20_000, timeout: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

const rejectsWith = (p: Promise<unknown>, text: string) =>
  assert.rejects(p, (e: unknown) => e instanceof EmrError && e.message.includes(text), `მოსალოდნელი შეცდომა: „${text}“`);

let doctor: { userId: number; profileId: number; duration: number; consultationId: number | null };
let otherDoctorUserId: number;
let labServiceId: number;
let procedureServiceId: number;

before(async () => {
  const user = await prisma.user.findFirst({ where: { username: "doctor", isActive: true }, include: { doctorProfile: true } });
  assert.ok(user?.doctorProfile, "ექიმი „doctor“ პროფილით ვერ მოიძებნა — გაუშვით npm run db:seed");
  doctor = {
    userId: user.id,
    profileId: user.doctorProfile.id,
    duration: user.doctorProfile.visitDuration,
    consultationId: user.doctorProfile.consultationServiceId,
  };
  const other = await prisma.user.findFirst({ where: { role: { code: "doctor" }, id: { not: user.id } } });
  assert.ok(other, "საჭიროა მეორე ექიმი");
  otherDoctorUserId = other.id;
  const lab = await prisma.service.findFirst({ where: { isActive: true, category: { orderType: "lab" } } });
  const procedure = await prisma.service.findFirst({ where: { isActive: true, category: { orderType: "procedure" } } });
  assert.ok(lab && procedure, "საჭიროა ლაბორატორიის და პროცედურის სერვისები (კატეგორიის დანიშნულების ტიპით)");
  labServiceId = lab.id;
  procedureServiceId = procedure.id;
  assert.ok(await prisma.icd10Code.findUnique({ where: { code: "I10" } }), "ICD-10 I10 არ არის — npm run icd10:import");
});

after(() => prisma.$disconnect());

/** სატესტო პაციენტი + „მიღებაზე“ ჯავშანი + ვიზიტის დრაფტი (I10 ძირითადი) + დანიშნულებები. */
async function visitFixture(tx: Tx) {
  const now = new Date();
  const patient = await tx.patient.create({
    data: {
      personalId: String(Date.now()).slice(-11).padStart(11, "9"),
      firstName: "ტესტი",
      lastName: "ინტეგრაცია",
      firstNameEn: "Test",
      lastNameEn: "Integration",
      birthDate: new Date("1990-01-01T00:00:00Z"),
      gender: "female",
    },
  });
  const appointment = await tx.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.profileId,
      startTime: now,
      endTime: new Date(now.getTime() + doctor.duration * 60_000),
      status: "in_progress",
      arrivedAt: now,
    },
  });
  const encounter = await tx.encounter.create({
    data: { appointmentId: appointment.id, patientId: patient.id, doctorId: doctor.userId, startedAt: now, updatedAt: now, complaints: "ტესტი" },
  });
  await tx.encounterDiagnosis.create({ data: { encounterId: encounter.id, icd10Code: "I10", isPrimary: true } });
  const order = (type: "lab" | "procedure", serviceId: number, status: "ordered" | "cancelled" = "ordered") =>
    tx.medicalOrder.create({
      data: { encounterId: encounter.id, patientId: patient.id, type, serviceId, serviceName: "ტესტი", status, createdById: doctor.userId, createdAt: now, updatedAt: now },
    });
  const lab1 = await order("lab", labServiceId);
  const lab2 = await order("lab", labServiceId);
  const cancelled = await order("procedure", procedureServiceId, "cancelled");
  return { patient, appointment, encounter, orders: { lab1, lab2, cancelled } };
}

describe("ექიმის სრული ციკლი: ვიზიტი → დანიშნულებები → დასრულება → ინვოისი", () => {
  it("ინვოისი: კონსულტაცია + კვლევები (ერთი ხაზი რაოდენობით), გაუქმებული — არა; ჩანაწერი იკეტება", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      const message = await completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: doctor.userId });
      assert.match(message, /ვიზიტი დასრულდა · ინვოისი INV-/);

      const invoice = await tx.invoice.findFirstOrThrow({ where: { appointmentId: f.appointment.id }, include: { items: true } });
      const byService = new Map(invoice.items.map((i) => [i.serviceId, i]));
      assert.equal(byService.get(labServiceId)?.quantity, 2, "ორი ერთნაირი კვლევა — ერთი ხაზი ×2");
      assert.equal(byService.has(procedureServiceId), false, "გაუქმებული დანიშნულება არ ირიცხება");
      if (doctor.consultationId) assert.ok(byService.has(doctor.consultationId), "კონსულტაცია ინვოისშია");
      // ფასი — ფასების ცხრილიდან
      const lab = await tx.service.findUniqueOrThrow({ where: { id: labServiceId } });
      assert.equal(byService.get(labServiceId)?.unitPrice.toFixed(2), lab.price.toFixed(2));
      assert.equal(invoice.doctorId, doctor.userId);

      const orders = await tx.medicalOrder.findMany({ where: { encounterId: f.encounter.id } });
      for (const o of orders) assert.equal(o.invoiceId, o.status === "cancelled" ? null : invoice.id);

      const [encounter, appointment] = await Promise.all([
        tx.encounter.findUniqueOrThrow({ where: { id: f.encounter.id } }),
        tx.appointment.findUniqueOrThrow({ where: { id: f.appointment.id } }),
      ]);
      assert.equal(encounter.status, "completed");
      assert.ok(encounter.completedAt);
      assert.equal(appointment.status, "completed");
      assert.ok(await tx.auditLog.findFirst({ where: { entity: "encounter", entityId: f.encounter.id, action: "complete" } }), "აუდიტი");
    });
  });

  it("ჯავშანს ინვოისი უკვე აქვს → დამატებითი ინვოისი მხოლოდ დანიშნულებებით, კონსულტაცია არ მეორდება", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      const first = await createInvoice(
        tx,
        {
          patientId: f.patient.id,
          appointmentId: f.appointment.id,
          doctorId: null,
          visitType: "outpatient",
          serviceDate: new Date().toISOString(),
          items: [{ serviceId: doctor.consultationId ?? labServiceId, quantity: 1, discountPercent: "0" }],
          disableInsurance: false,
          disableInsuranceReason: null,
          comment: null,
        },
        doctor.userId,
      );
      const preview = await loadCompletionPreview(tx, f.encounter.id);
      assert.equal(preview?.existingInvoice, first.number);

      await completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: doctor.userId });
      const supplementary = await tx.invoice.findFirstOrThrow({
        where: { patientId: f.patient.id, id: { not: first.id } },
        include: { items: true },
      });
      assert.equal(supplementary.appointmentId, null, "დამატებითი ინვოისი ჯავშანზე არ ებმება");
      assert.deepEqual(supplementary.items.map((i) => [i.serviceId, i.quantity]), [[labServiceId, 2]]);
      // რიგში ახალი ჩანაწერი არ შექმნილა
      assert.equal(await tx.appointment.count({ where: { patientId: f.patient.id } }), 1);
    });
  });

  it("დასრულება ძირითადი დიაგნოზის გარეშე — უარი, არაფერი იცვლება", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      await tx.encounterDiagnosis.deleteMany({ where: { encounterId: f.encounter.id } });
      await rejectsWith(completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: doctor.userId }), "ძირითადი დიაგნოზი");
      assert.equal((await tx.encounter.findUniqueOrThrow({ where: { id: f.encounter.id } })).status, "draft");
    });
  });

  it("ძველი ვერსიით დასრულება (სხვა ფანჯარაში შეიცვალა) — უარი", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      await tx.encounter.update({ where: { id: f.encounter.id }, data: { version: 2 } });
      await rejectsWith(completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: doctor.userId }), "შეიცვალა");
    });
  });
});

describe("ჩაკეტილი ჩანაწერი", () => {
  it("დასრულებული ვიზიტი: ცვლილება/დანიშნულება/განმეორებითი დასრულება — უარი", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      await completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: doctor.userId });
      await rejectsWith(ownDraftEncounter(tx, f.encounter.id, doctor.userId), "ჩაკეტილია");
      await rejectsWith(completeEncounter(tx, { encounterId: f.encounter.id, version: 2, userId: doctor.userId }), "უკვე დასრულებულია");
      assert.equal(await tx.invoice.count({ where: { patientId: f.patient.id } }), 1, "მეორე ინვოისი არ შეიქმნა");
    });
  });

  it("სხვა ექიმის ვიზიტი — მხოლოდ სანახავად", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      await rejectsWith(ownDraftEncounter(tx, f.encounter.id, otherDoctorUserId), "სხვა ექიმისაა");
      await rejectsWith(completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: otherDoctorUserId }), "მხოლოდ მისი ექიმი");
    });
  });

  it("ხელმოწერილი დოკუმენტი — ჩაკეტილია; სხვისი დრაფტი — ავტორის გარდა ვერავინ ასწორებს", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      const base = { patientId: f.patient.id, encounterId: f.encounter.id, type: "referral" as const, title: "მიმართვა", content: "{}", createdById: doctor.userId, createdAt: new Date() };
      const signed = await tx.medicalDocument.create({ data: { ...base, status: "signed", signedAt: new Date(), sha256: "0".repeat(64) } });
      const draft = await tx.medicalDocument.create({ data: base });
      await rejectsWith(lockOwnDraftDocument(tx, signed.id, doctor.userId), "ჩაკეტილია");
      await rejectsWith(lockOwnDraftDocument(tx, draft.id, otherDoctorUserId), "ავტორი");
      const ok = await lockOwnDraftDocument(tx, draft.id, doctor.userId);
      assert.equal(ok.id, draft.id);
    });
  });
});

describe("ცოცხალი რიგი და შეტყობინება", () => {
  it("ინვოისი ექიმით, ჯავშნის გარეშე → ექიმის რიგში „მობრძანდა“ + ექიმს შეტყობინება", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      await tx.appointment.update({ where: { id: f.appointment.id }, data: { status: "completed" } });
      await createInvoice(
        tx,
        {
          patientId: f.patient.id,
          appointmentId: null,
          doctorId: doctor.userId,
          visitType: "outpatient",
          serviceDate: new Date().toISOString(),
          items: [{ serviceId: labServiceId, quantity: 1, discountPercent: "0" }],
          disableInsurance: false,
          disableInsuranceReason: null,
          comment: null,
        },
        doctor.userId,
      );
      const queued = await tx.appointment.findFirstOrThrow({ where: { patientId: f.patient.id, source: "walk_in" } });
      assert.equal(queued.status, "arrived");
      const n = await tx.notification.findFirst({ where: { userId: doctor.userId, type: "patient_arrived", link: `/doctor?appointment=${queued.id}` } });
      assert.ok(n, "შეტყობინება ექიმს");
    });
  });
});

describe("სპეციალობის მაჩვენებლები", () => {
  it("ვიზიტზე ჩანს სპეციალობის ნაკრები; არასწორი მნიშვნელობა არ ინახება; სავალდებულო — დასრულებამდე", async () => {
    await inRollback(async (tx) => {
      const f = await visitFixture(tx);
      const profile = await tx.doctor.findUniqueOrThrow({ where: { id: doctor.profileId } });
      await tx.encounter.update({ where: { id: f.encounter.id }, data: { specialtyId: profile.specialtyId } });
      const now = new Date();
      const iop = await tx.measurementDefinition.create({
        data: { name: `ტესტი: თვალშიდა წნევა ${Date.now()}`, unit: "მმ Hg", type: "number", sides: "eyes", minValue: 5, maxValue: 60, normalMin: 10, normalMax: 21, decimals: 1, createdAt: now, updatedAt: now },
      });
      await tx.specialtyMeasurement.create({ data: { specialtyId: profile.specialtyId, definitionId: iop.id, sortOrder: 999, required: true } });

      const form = await loadEncounterMeasurements(tx, f.encounter.id);
      assert.ok(form.defs.some((d) => d.id === iop.id && d.required && d.sides === "eyes"));

      await assert.rejects(saveEncounterMeasurements(tx, f.encounter.id, f.patient.id, { [`${iop.id}:right`]: "99" }), EmrError);
      // სავალდებულო: ერთი თვალი შეუვსებელია → დასრულება ვერ ხერხდება
      await saveEncounterMeasurements(tx, f.encounter.id, f.patient.id, { [`${iop.id}:right`]: "15,5" });
      await rejectsWith(completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: doctor.userId }), "სავალდებულო მაჩვენებლები");
      await saveEncounterMeasurements(tx, f.encounter.id, f.patient.id, { [`${iop.id}:right`]: "15,5", [`${iop.id}:left`]: "16", "999999:none": "x" });
      const saved = await tx.encounterMeasurement.findMany({ where: { encounterId: f.encounter.id }, orderBy: { side: "asc" } });
      assert.deepEqual(saved.map((s) => [s.side, s.valueNum?.toNumber()]), [["right", 15.5], ["left", 16]]);
      await completeEncounter(tx, { encounterId: f.encounter.id, version: 1, userId: doctor.userId });
      const lines = (await formatMeasurementsOf(tx, [f.encounter.id])).get(f.encounter.id);
      assert.ok(lines?.some((l) => l.endsWith("OD: 15.5 მმ Hg")));
    });
  });
});
