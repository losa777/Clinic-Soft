/**
 * საწყობის ინტეგრაციული ტესტები რეალურ ბაზაზე (.env.local): შემოსავალი, FEFO გახარჯვა, ვადაგასული, ჩამოწერა,
 * მცირე ნაშთის გაფრთხილება. ყოველი ტესტი ერთ ტრანზაქციაშია და ბოლოს უქმდება (ROLLBACK).
 * გაშვება: npm run test:integration  (საჭიროა: npm run db:setup).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { dateValue, InventoryError } from "@/modules/inventory/server/db";
import { applyCount, consume, createReceipt, writeOff } from "@/modules/inventory/server/operations";
import { fromDecimal } from "@/modules/inventory/stock";

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

async function inRollback(fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { maxWait: 20_000, timeout: 90_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

const today = tbilisiToday();

async function setup(tx: Tx, minQuantity = "0") {
  const admin = await tx.user.findFirstOrThrow({ where: { role: { code: "admin" }, isActive: true }, select: { id: true } });
  const now = new Date();
  const item = await tx.inventoryItem.create({
    data: { name: `ტესტი ${randomUUID().slice(0, 8)}`, category: "medication", unit: "ამპულა", minQuantity, tracksExpiry: true, createdAt: now, updatedAt: now },
  });
  return { userId: admin.id, item };
}

const batchQuantities = async (tx: Tx, itemId: number) =>
  (await tx.inventoryBatch.findMany({ where: { itemId }, orderBy: { id: "asc" } })).map((b) => fromDecimal(b.quantity));

describe("საწყობი", () => {
  after(() => prisma.$disconnect());

  it("სამეურნეო: გაცემა მხოლოდ საწყობიდან, „ვის/სად“ სავალდებულოა; პაციენტზე/პროცედურაზე — არა", async () => {
    await inRollback(async (tx) => {
      const { userId } = await setup(tx);
      const now = new Date();
      const item = await tx.inventoryItem.create({
        data: { name: `ტესტი ${randomUUID().slice(0, 8)}`, category: "stationery", unit: "ცალი", minQuantity: "0", tracksExpiry: false, createdAt: now, updatedAt: now },
      });
      await createReceipt(tx, userId, {
        supplierId: null,
        documentNumber: null,
        receivedOn: today,
        note: null,
        lines: [{ itemId: item.id, quantity: 5000, lotNumber: null, expiryDate: null, unitCost: "0.50" }],
      });
      const isError = (field?: string) => (e: unknown) => e instanceof InventoryError && (!field || Boolean(e.fieldErrors?.[field]));
      // ექთანი/ლაბორანტი (allowGeneral-ის გარეშე)
      await assert.rejects(consume(tx, userId, { itemId: item.id, quantity: 100, note: null, recipient: "რეგისტრატურა" }), isError());
      // მიმღების გარეშე
      await assert.rejects(consume(tx, userId, { itemId: item.id, quantity: 100, note: null, allowGeneral: true }), isError("recipient"));
      // პაციენტზე — არა
      const patient = await tx.patient.findFirstOrThrow({ select: { id: true } });
      await assert.rejects(
        consume(tx, userId, { itemId: item.id, quantity: 100, note: null, recipient: "x", patientId: patient.id, allowGeneral: true }),
        isError(),
      );
      await consume(tx, userId, { itemId: item.id, quantity: 300, note: null, recipient: "რეგისტრატურა", allowGeneral: true });
      const move = await tx.inventoryMovement.findFirstOrThrow({ where: { itemId: item.id, type: "consumption" } });
      assert.equal(move.recipient, "რეგისტრატურა");
      assert.deepEqual(await batchQuantities(tx, item.id), [4700]);
    });
  });

  it("შემოსავალი: პარტიები და მოძრაობები; ვადა სავალდებულოა, ვადაგასული არ მიიღება", async () => {
    await inRollback(async (tx) => {
      const { userId, item } = await setup(tx);
      await createReceipt(tx, userId, {
        supplierId: null,
        documentNumber: "WB-1",
        receivedOn: today,
        note: null,
        lines: [
          { itemId: item.id, quantity: 1000, lotNumber: "A", expiryDate: addDays(today, 200), unitCost: "1.50" },
          { itemId: item.id, quantity: 550, lotNumber: "B", expiryDate: addDays(today, 20), unitCost: null },
        ],
      });
      assert.deepEqual(await batchQuantities(tx, item.id), [1000, 550]);
      const moves = await tx.inventoryMovement.findMany({ where: { itemId: item.id } });
      assert.deepEqual(moves.map((m) => [m.type, fromDecimal(m.quantity)]), [["receipt", 1000], ["receipt", 550]]);

      await assert.rejects(
        createReceipt(tx, userId, { supplierId: null, documentNumber: null, receivedOn: today, note: null, lines: [{ itemId: item.id, quantity: 100, lotNumber: null, expiryDate: null, unitCost: null }] }),
        (e: unknown) => e instanceof InventoryError && e.fieldErrors?.["lines.0.expiryDate"] === "მიუთითეთ ვარგისიანობის ვადა",
      );
      await assert.rejects(
        createReceipt(tx, userId, { supplierId: null, documentNumber: null, receivedOn: today, note: null, lines: [{ itemId: item.id, quantity: 100, lotNumber: null, expiryDate: addDays(today, -1), unitCost: null }] }),
        (e: unknown) => e instanceof InventoryError && Boolean(e.fieldErrors?.["lines.0.expiryDate"]),
      );
    });
  });

  it("გახარჯვა FEFO-თი: ჯერ ადრე ვადაგასული; ვადაგასული არ იხარჯება; ნაშთზე მეტი — შეცდომა", async () => {
    await inRollback(async (tx) => {
      const { userId, item } = await setup(tx);
      const now = new Date();
      // ვადაგასული პარტია (შემოსავლით ვერ შემოვა — პირდაპირ)
      await tx.inventoryBatch.create({
        data: { itemId: item.id, expiryDate: dateValue(addDays(today, -5)), receivedQuantity: "3", quantity: "3", createdAt: now },
      });
      await createReceipt(tx, userId, {
        supplierId: null,
        documentNumber: null,
        receivedOn: today,
        note: null,
        lines: [
          { itemId: item.id, quantity: 1000, lotNumber: "late", expiryDate: addDays(today, 300), unitCost: null },
          { itemId: item.id, quantity: 200, lotNumber: "soon", expiryDate: addDays(today, 10), unitCost: null },
        ],
      });

      // რაოდენობები მეასედებშია: 350 = 3,5 ამპულა
      await consume(tx, userId, { itemId: item.id, quantity: 350, note: "პროცედურა" });
      // ვადაგასული (3) ხელუხლებელია, "soon" (2) ამოიწურა, "late"-დან 1,5
      assert.deepEqual(await batchQuantities(tx, item.id), [300, 850, 0]);
      const moves = await tx.inventoryMovement.findMany({ where: { itemId: item.id, type: "consumption" }, orderBy: { id: "asc" } });
      assert.deepEqual(moves.map((m) => fromDecimal(m.quantity)), [-200, -150]);

      await assert.rejects(
        consume(tx, userId, { itemId: item.id, quantity: 851, note: null }),
        (e: unknown) => e instanceof InventoryError && e.message.startsWith(`ნაშთი არ ჰყოფნის: ${item.name}`),
      );

    });
  });

  it("ჩამოწერა: მხოლოდ პარტიის ნაშთამდე; „ვადაგასული“ — მხოლოდ ვადაგასულ პარტიაზე", async () => {
    await inRollback(async (tx) => {
      const { userId, item } = await setup(tx);
      const now = new Date();
      const expired = await tx.inventoryBatch.create({
        data: { itemId: item.id, expiryDate: dateValue(addDays(today, -1)), receivedQuantity: "50", quantity: "50", createdAt: now },
      });
      const fresh = await tx.inventoryBatch.create({
        data: { itemId: item.id, expiryDate: dateValue(addDays(today, 100)), receivedQuantity: "50", quantity: "50", createdAt: now },
      });
      await assert.rejects(writeOff(tx, userId, { batchId: fresh.id, quantity: 100, reason: "expired", note: null }), InventoryError);
      await assert.rejects(writeOff(tx, userId, { batchId: expired.id, quantity: 5100, reason: "expired", note: null }), InventoryError);
      await writeOff(tx, userId, { batchId: expired.id, quantity: 5000, reason: "expired", note: null });
      await writeOff(tx, userId, { batchId: fresh.id, quantity: 100, reason: "damaged", note: "გატყდა" });
      assert.deepEqual(await batchQuantities(tx, item.id), [0, 4900]);
      const w = await tx.inventoryMovement.findMany({ where: { itemId: item.id, type: "writeoff" }, orderBy: { id: "asc" } });
      assert.deepEqual(w.map((m) => [m.reason, fromDecimal(m.quantity)]), [["expired", -5000], ["damaged", -100]]);
    });
  });

  it("მცირე ნაშთი: გაფრთხილება მხოლოდ ზღვრის გადაკვეთისას", async () => {
    await inRollback(async (tx) => {
      const { userId, item } = await setup(tx, "10");
      await createReceipt(tx, userId, {
        supplierId: null,
        documentNumber: null,
        receivedOn: today,
        note: null,
        lines: [{ itemId: item.id, quantity: 1500, lotNumber: null, expiryDate: addDays(today, 100), unitCost: null }],
      });
      const count = () => tx.notification.count({ where: { userId, type: "inventory_low", title: { contains: item.name } } });
      await consume(tx, userId, { itemId: item.id, quantity: 400, note: null }); // 15 → 11
      assert.equal(await count(), 0);
      await consume(tx, userId, { itemId: item.id, quantity: 200, note: null }); // 11 → 9: გადაკვეთა
      assert.equal(await count(), 1);
      await consume(tx, userId, { itemId: item.id, quantity: 100, note: null }); // 9 → 8: უკვე ქვემოთაა
      assert.equal(await count(), 1);
    });
  });

  it("ინვენტარიზაცია: სხვაობა ± კორექტირებით; შეცვლილი ნაშთი — შეცდომა, არაფერი იცვლება", async () => {
    await inRollback(async (tx) => {
      const { userId, item } = await setup(tx);
      await createReceipt(tx, userId, {
        supplierId: null,
        documentNumber: null,
        receivedOn: today,
        note: null,
        lines: [
          { itemId: item.id, quantity: 1000, lotNumber: "A", expiryDate: addDays(today, 50), unitCost: null },
          { itemId: item.id, quantity: 500, lotNumber: "B", expiryDate: addDays(today, 90), unitCost: null },
        ],
      });
      const [a, b] = await tx.inventoryBatch.findMany({ where: { itemId: item.id }, orderBy: { id: "asc" } });
      // ნაშთი ფორმის ჩატვირთვის შემდეგ შეიცვალა (expected ძველია) — ტრანზაქცია უქმდება
      await assert.rejects(
        applyCount(tx, userId, { note: "ტესტი", lines: [{ batchId: a.id, expected: 999, counted: 900 }] }),
        (e: unknown) => e instanceof InventoryError && Boolean(e.fieldErrors?.[`batch.${a.id}`]),
      );
      const changed = await applyCount(tx, userId, {
        note: "ინვენტარიზაცია",
        lines: [
          { batchId: a.id, expected: 1000, counted: 950 },
          { batchId: b.id, expected: 500, counted: 520 },
        ],
      });
      assert.equal(changed, 2);
      assert.deepEqual(await batchQuantities(tx, item.id), [950, 520]);
      const adj = await tx.inventoryMovement.findMany({ where: { itemId: item.id, type: "adjustment" }, orderBy: { id: "asc" } });
      assert.deepEqual(adj.map((m) => fromDecimal(m.quantity)), [-50, 20]);
    });
  });

  it("პროცედურისას გახარჯვა: მოძრაობას პაციენტი და დანიშნულება ებმის", async () => {
    await inRollback(async (tx) => {
      const order = await tx.medicalOrder.findFirst({ select: { id: true, patientId: true } });
      if (!order) return; // ბაზაში დანიშნულება ჯერ არ არის (npm run db:seed)
      const { userId, item } = await setup(tx);
      await createReceipt(tx, userId, {
        supplierId: null,
        documentNumber: null,
        receivedOn: today,
        note: null,
        lines: [{ itemId: item.id, quantity: 1000, lotNumber: null, expiryDate: addDays(today, 50), unitCost: null }],
      });
      await consume(tx, userId, { itemId: item.id, quantity: 100, note: "ინექცია", patientId: order.patientId, medicalOrderId: order.id });
      const m = await tx.inventoryMovement.findFirstOrThrow({ where: { itemId: item.id, type: "consumption" } });
      assert.equal(m.patientId, order.patientId);
      assert.equal(m.medicalOrderId, order.id);
    });
  });
});
