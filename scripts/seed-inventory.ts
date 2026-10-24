/**
 * საწყობის სატესტო მონაცემები: კატალოგი (მედიკამენტი, სახარჯი, რეაგენტი), 2 მომწოდებელი, შემოსავლები, სერვისების ნორმები,
 * გახარჯვა, ჩამოწერა და ერთი ვადაგასული პარტია — ნაშთების, გაფრთხილებების და მოძრაობების სანახავად.
 * ოპერაციები იმავე ფუნქციებით, რასაც აპლიკაცია იყენებს (FEFO, ჩაკეტვა, მოძრაობები).
 * იდემპოტენტურია: თუ კატალოგში რომელიმე სატესტო დასახელება უკვე არის — არაფერს აკეთებს.
 * საჭიროა: npm run db:setup. გაშვება: npm run db:seed
 */
import { addDays, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { dateValue, inventoryTx } from "@/modules/inventory/server/db";
import { consume, createReceipt, writeOff } from "@/modules/inventory/server/operations";
import { parseQuantity } from "@/modules/inventory/stock";

type Category = "medication" | "consumable" | "reagent";

const ITEMS: [name: string, category: Category, unit: string, min: string, tracksExpiry: boolean][] = [
  ["შპრიცი 5 მლ", "consumable", "ცალი", "100", false],
  ["შპრიცი 10 მლ", "consumable", "ცალი", "50", false],
  ["ხელთათმანი ნიტრილის (M)", "consumable", "წყვილი", "200", false],
  ["სპირტიანი ხელსახოცი", "consumable", "ცალი", "300", false],
  ["სისტემა ინფუზიისთვის", "consumable", "ცალი", "20", true],
  ["ნატრიუმის ქლორიდი 0,9% 250 მლ", "medication", "ფლაკონი", "30", true],
  ["დიკლოფენაკი 75 მგ/3 მლ", "medication", "ამპულა", "40", true],
  ["დექსამეთაზონი 4 მგ/1 მლ", "medication", "ამპულა", "20", true],
  ["ცეფტრიაქსონი 1 გ", "medication", "ფლაკონი", "15", true],
  ["გლუკოზის ტესტ-ზოლები", "reagent", "ტესტი", "100", true],
];

const q = (v: string) => parseQuantity(v)!;

/** სერვისის ნორმები (seed-finance-ის სერვისები): ერთ შესრულებაზე გასახარჯი მასალა. */
const NORMS: [service: string, materials: [item: string, quantity: string][]][] = [
  ["კუნთშიდა ინექცია", [["შპრიცი 5 მლ", "1"], ["ხელთათმანი ნიტრილის (M)", "1"], ["სპირტიანი ხელსახოცი", "2"]]],
  [
    "ინტრავენური ინფუზია (წვეთოვანი)",
    [["სისტემა ინფუზიისთვის", "1"], ["ნატრიუმის ქლორიდი 0,9% 250 მლ", "1"], ["ხელთათმანი ნიტრილის (M)", "1"], ["სპირტიანი ხელსახოცი", "2"]],
  ],
  ["ჭრილობის დამუშავება", [["ხელთათმანი ნიტრილის (M)", "1"], ["სპირტიანი ხელსახოცი", "3"]]],
  ["გლუკოზა სისხლში", [["გლუკოზის ტესტ-ზოლები", "1"], ["ხელთათმანი ნიტრილის (M)", "1"], ["სპირტიანი ხელსახოცი", "1"]]],
];

/** ნორმები — მხოლოდ თუ ჯერ არცერთი არ არის (ადმინის ცვლილებები არ გადაიწერება). */
async function seedNorms() {
  if (await prisma.serviceMaterial.count()) return;
  const items = new Map((await prisma.inventoryItem.findMany({ select: { id: true, name: true } })).map((i) => [i.name, i.id]));
  let added = 0;
  for (const [serviceName, materials] of NORMS) {
    const service = await prisma.service.findUnique({ where: { name: serviceName }, select: { id: true } });
    if (!service) continue;
    const data = materials.flatMap(([name, quantity]) => (items.has(name) ? [{ serviceId: service.id, itemId: items.get(name)!, quantity }] : []));
    await prisma.serviceMaterial.createMany({ data });
    added++;
  }
  if (added) console.log(`✔ საწყობი: ${added} სერვისის ნორმა`);
}

async function main() {
  if (await prisma.inventoryItem.count({ where: { name: { in: ITEMS.map((i) => i[0]) } } })) {
    await seedNorms();
    console.log("✔ საწყობი: სატესტო მონაცემები უკვე არსებობს");
    return;
  }
  const admin = await prisma.user.findFirstOrThrow({ where: { role: { code: { in: ["warehouse", "admin"] } }, isActive: true }, select: { id: true } });
  const today = tbilisiToday();
  const now = new Date();

  const ids: Record<string, number> = {};
  for (const [name, category, unit, min, tracksExpiry] of ITEMS) {
    const item = await prisma.inventoryItem.create({
      data: { name, category, unit, minQuantity: min, tracksExpiry, createdAt: now, updatedAt: now },
    });
    ids[name] = item.id;
  }
  const [medsupply, labsupply] = await Promise.all(
    [
      { name: "შპს „მედსაპლაი“ (სატესტო)", taxId: "404000001" },
      { name: "შპს „ლაბსერვისი“ (სატესტო)", taxId: "404000002" },
    ].map((s) => prisma.inventorySupplier.create({ data: { ...s, createdAt: now } })),
  );

  const line = (name: string, quantity: string, expiry: number | null, cost: string, lot: string | null = null) => ({
    itemId: ids[name],
    quantity: q(quantity),
    lotNumber: lot,
    expiryDate: expiry === null ? null : addDays(today, expiry),
    unitCost: cost,
  });

  await inventoryTx(async (tx) => {
    await createReceipt(tx, admin.id, {
      supplierId: medsupply.id,
      documentNumber: "ზედ-0001",
      receivedOn: addDays(today, -20),
      note: null,
      lines: [
        line("შპრიცი 5 მლ", "500", null, "0.25"),
        line("შპრიცი 10 მლ", "200", null, "0.35"),
        line("ხელთათმანი ნიტრილის (M)", "400", null, "0.40"),
        line("სპირტიანი ხელსახოცი", "1000", null, "0.05"),
        line("სისტემა ინფუზიისთვის", "60", 700, "1.20", "IV-2026-11"),
        line("ნატრიუმის ქლორიდი 0,9% 250 მლ", "40", 400, "2.10", "NC-8841"),
        line("ნატრიუმის ქლორიდი 0,9% 250 მლ", "30", 18, "2.00", "NC-7710"),
        line("დიკლოფენაკი 75 მგ/3 მლ", "100", 300, "0.90", "DF-5521"),
        line("დექსამეთაზონი 4 მგ/1 მლ", "50", 25, "1.10", "DX-3301"),
        line("ცეფტრიაქსონი 1 გ", "30", 500, "3.50", "CF-1290"),
      ],
    });
    await createReceipt(tx, admin.id, {
      supplierId: labsupply.id,
      documentNumber: "LS-778",
      receivedOn: addDays(today, -10),
      note: null,
      lines: [line("გლუკოზის ტესტ-ზოლები", "150", 240, "0.60", "GL-0425")],
    });
  });

  // ვადაგასული პარტია (შემოსავლით ვერ მიიღება — წინა ზედნადებიდან „დარჩენილი“)
  await prisma.inventoryBatch.create({
    data: { itemId: ids["დექსამეთაზონი 4 მგ/1 მლ"], lotNumber: "DX-2901", expiryDate: dateValue(addDays(today, -3)), unitCost: "1.05", receivedQuantity: "10", quantity: "6", createdAt: now },
  });

  const use: [string, string, string][] = [
    ["შპრიცი 5 მლ", "120", "პროცედურების კაბინეტი"],
    ["ხელთათმანი ნიტრილის (M)", "210", "პროცედურების კაბინეტი"],
    ["სპირტიანი ხელსახოცი", "180", "პროცედურების კაბინეტი"],
    ["დიკლოფენაკი 75 მგ/3 მლ", "64", "კუნთშიდა ინექციები"],
    ["ნატრიუმის ქლორიდი 0,9% 250 მლ", "36", "ინფუზიები"],
    ["ცეფტრიაქსონი 1 გ", "18", "ინფუზიები"],
    ["გლუკოზის ტესტ-ზოლები", "40", "ლაბორატორია"],
  ];
  for (const [name, quantity, note] of use) {
    await inventoryTx((tx) => consume(tx, admin.id, { itemId: ids[name], quantity: q(quantity), note }));
  }
  const damaged = await prisma.inventoryBatch.findFirstOrThrow({ where: { itemId: ids["ნატრიუმის ქლორიდი 0,9% 250 მლ"], lotNumber: "NC-8841" } });
  await inventoryTx((tx) => writeOff(tx, admin.id, { batchId: damaged.id, quantity: q("2"), reason: "damaged", note: "ფლაკონი გაიბზარა" }));

  console.log(`✔ საწყობი: ${ITEMS.length} დასახელება, 2 მომწოდებელი, შემოსავლები, გახარჯვა და ჩამოწერა`);
  await seedNorms();
}

main()
  .catch((err) => {
    console.error("✖ საწყობის სატესტო მონაცემები ვერ შეიქმნა:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
