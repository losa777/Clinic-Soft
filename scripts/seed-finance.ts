/**
 * ფინანსების სატესტო მონაცემები: სერვისები კატეგორიებით, ექიმების კონსულტაციის სერვისები, სადაზღვევო კომპანიები
 * პირობებით, პაციენტების პოლისები და რამდენიმე ინვოისი გადახდებით (ერთ სალაროს ცვლაში).
 * ინვოისები და გადახდები იქმნება იმავე სერვისის ფუნქციებით, რასაც აპლიკაცია იყენებს (ფასი, დაზღვევა, ნომრები).
 * იდემპოტენტურია: სერვისები/კომპანიები სახელით, სატესტო ინვოისები — მხოლოდ თუ ჯერ არ შექმნილა.
 * საჭიროა: npm run db:setup და seed-appointments (პაციენტები, ექიმები). გაშვება: npm run db:seed
 */
import type { Prisma } from "@/generated/prisma/client";
import { addDays, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { closeShift, openShift } from "@/modules/finance/server/cash";
import { FINANCE_TX } from "@/modules/finance/server/errors";
import { cancelInvoice, createInvoice } from "@/modules/finance/server/invoices";
import { acceptPayment, refundPayment } from "@/modules/finance/server/payments";

const SEED_COMMENT = "სატესტო ინვოისი (seed)";

const SERVICES: [category: string, name: string, price: string][] = [
  ["კონსულტაცია", "თერაპევტის კონსულტაცია", "50"],
  ["კონსულტაცია", "კარდიოლოგის კონსულტაცია", "80"],
  ["კონსულტაცია", "პედიატრის კონსულტაცია", "50"],
  ["კონსულტაცია", "ნევროლოგის კონსულტაცია", "70"],
  ["კონსულტაცია", "ენდოკრინოლოგის კონსულტაცია", "70"],
  ["ლაბორატორია", "სისხლის საერთო ანალიზი", "15"],
  ["ლაბორატორია", "ბიოქიმიური ანალიზი (პანელი)", "40"],
  ["ლაბორატორია", "გლუკოზა სისხლში", "8"],
  ["ლაბორატორია", "ფარისებრი ჯირკვლის ჰორმონი (TSH)", "25"],
  ["ლაბორატორია", "შარდის საერთო ანალიზი", "10"],
  ["დიაგნოსტიკა", "ელექტროკარდიოგრაფია (ეკგ)", "30"],
  ["დიაგნოსტიკა", "ექოკარდიოგრაფია", "90"],
  ["დიაგნოსტიკა", "მუცლის ღრუს ექოსკოპია", "70"],
  ["დიაგნოსტიკა", "გულმკერდის რენტგენოგრაფია", "45"],
  ["პროცედურა", "კუნთშიდა ინექცია", "10"],
  ["პროცედურა", "ინტრავენური ინფუზია (წვეთოვანი)", "35"],
  ["პროცედურა", "ჭრილობის დამუშავება", "25"],
  ["პროცედურა", "ნაკერების მოხსნა", "20"],
];

/** seed-appointments-ის ექიმები → კონსულტაციის სერვისი. */
const CONSULTATIONS: Record<string, string> = {
  doctor: "თერაპევტის კონსულტაცია",
  "dr.kharaishvili": "თერაპევტის კონსულტაცია",
  "dr.tsiklauri": "კარდიოლოგის კონსულტაცია",
  "dr.bakradze": "პედიატრის კონსულტაცია",
  "dr.nadiradze": "ნევროლოგის კონსულტაცია",
  "dr.kavtaradze": "ენდოკრინოლოგის კონსულტაცია",
};

/** სატესტო (გამოგონილი) სადაზღვევო კომპანიები. პირობა: [სერვისი ან „კატ:კატეგორია“, %, ლიმიტი ერთეულზე]. */
const COMPANIES: [name: string, contracts: [target: string, percent: string, limit: string | null][]][] = [
  [
    "სადაზღვევო „ბალანსი“",
    [
      ["კატ:კონსულტაცია", "70", "50"],
      ["კატ:ლაბორატორია", "80", null],
      ["კატ:დიაგნოსტიკა", "50", "60"],
      ["ექოკარდიოგრაფია", "90", null],
    ],
  ],
  [
    "„მედპოლისი“",
    [
      ["კატ:კონსულტაცია", "100", "40"],
      ["კატ:ლაბორატორია", "50", null],
    ],
  ],
  ["„ოჯახის დაზღვევა“", [["კატ:პროცედურა", "100", "15"]]],
];

async function main() {
  // სერვისები და კატეგორიები (არსებულ სერვისს ფასს არ ვუცვლით)
  const categories = new Map<string, number>();
  for (const name of new Set(SERVICES.map(([c]) => c))) {
    const c = await prisma.serviceCategory.upsert({ where: { name }, create: { name }, update: {} });
    categories.set(name, c.id);
  }
  for (const [category, name, price] of SERVICES) {
    await prisma.service.upsert({
      where: { name },
      create: { name, price, categoryId: categories.get(category)! },
      update: { categoryId: categories.get(category)! },
    });
  }
  const services = new Map((await prisma.service.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]));
  console.log(`✔ სერვისები: ${SERVICES.length} (კატეგორია: ${categories.size})`);

  for (const [username, service] of Object.entries(CONSULTATIONS)) {
    await prisma.doctor.updateMany({ where: { user: { username } }, data: { consultationServiceId: services.get(service)! } });
  }
  console.log("✔ ექიმების კონსულტაციის სერვისები");

  const companies: number[] = [];
  for (const [name, contracts] of COMPANIES) {
    const company = await prisma.insuranceCompany.upsert({ where: { name }, create: { name }, update: {} });
    companies.push(company.id);
    for (const [target, percent, limit] of contracts) {
      const isCategory = target.startsWith("კატ:");
      const data = {
        companyId: company.id,
        serviceId: isCategory ? null : services.get(target)!,
        categoryId: isCategory ? categories.get(target.slice(4))! : null,
        coveragePercent: percent,
        limitAmount: limit,
      };
      const existing = await prisma.insuranceContract.findFirst({
        where: { companyId: company.id, serviceId: data.serviceId, categoryId: data.categoryId },
      });
      if (!existing) await prisma.insuranceContract.create({ data });
    }
  }
  console.log(`✔ სადაზღვევო კომპანიები: ${COMPANIES.length}`);

  const patients = await prisma.patient.findMany({
    where: { personalId: { startsWith: "010990000" } },
    orderBy: { personalId: "asc" },
    select: { id: true },
  });
  if (patients.length < 8) throw new Error("სატესტო პაციენტები ვერ მოიძებნა — ჯერ გაუშვით seed-appointments");
  const registrar = await prisma.user.findUnique({ where: { username: "registrar" } });
  if (!registrar) throw new Error("მომხმარებელი „registrar“ ვერ მოიძებნა — ჯერ გაუშვით npm run db:setup");

  // პოლისები: 1,4 — „ბალანსი“, 2 — „მედპოლისი“, 6 — „ოჯახის დაზღვევა“, 7 — ვადაგასული
  const today = tbilisiToday();
  const day = (offset: number) => new Date(`${addDays(today, offset)}T00:00:00Z`);
  const policies: [patient: number, company: number, number: string, from: number, to: number][] = [
    [0, 0, "BAL-100001", -180, 185],
    [3, 0, "BAL-100002", -30, 335],
    [1, 1, "MP-55501", -90, 275],
    [5, 2, "OJ-7001", -10, 355],
    [6, 1, "MP-55400", -400, -35],
  ];
  for (const [p, c, policyNumber, from, to] of policies) {
    const exists = await prisma.patientInsurance.count({ where: { patientId: patients[p].id, policyNumber } });
    if (!exists) {
      await prisma.patientInsurance.create({
        data: {
          patientId: patients[p].id,
          companyId: companies[c],
          policyNumber,
          validFrom: day(from),
          validTo: day(to),
          createdById: registrar.id,
          createdAt: new Date(),
        },
      });
    }
  }
  console.log(`✔ პოლისები: ${policies.length}`);

  if (await prisma.invoice.count({ where: { comment: SEED_COMMENT } })) {
    console.log("✔ სატესტო ინვოისები უკვე არსებობს — გამოტოვებულია");
    return;
  }

  // ინვოისები რეგისტრატორის სახელით, ერთ ცვლაში
  const userId = registrar.id;
  const existingShift = await prisma.cashShift.findFirst({ where: { userId, status: "open" }, select: { id: true } });
  const shiftId = existingShift?.id ?? (await openShift(userId, "100.00")).id;
  const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, FINANCE_TX);
  const invoice = (patient: number, items: [string, number, string][]) =>
    tx((t) =>
      createInvoice(
        t,
        {
          patientId: patients[patient].id,
          appointmentId: null,
          doctorId: null,
          visitType: "outpatient",
          serviceDate: new Date().toISOString(),
          items: items.map(([name, quantity, discountPercent]) => ({ serviceId: services.get(name)!, quantity, discountPercent })),
          disableInsurance: false,
          disableInsuranceReason: null,
          comment: SEED_COMMENT,
        },
        userId,
      ),
    );
  const pay = (invoiceId: number, method: "cash" | "card", amount: string, received: string | null = null) =>
    tx((t) => acceptPayment(t, { invoiceId, method, amount, receivedAmount: received, cardReference: method === "card" ? "4321" : null }, userId));

  // 1. დაზღვეული („ბალანსი“): კონსულტაცია 70% (ლიმიტი 50) + ანალიზი 80% → სრულად ნაღდით, ხურდით
  const i1 = await invoice(0, [["თერაპევტის კონსულტაცია", 1, "0"], ["სისხლის საერთო ანალიზი", 1, "0"]]);
  const d1 = await prisma.invoice.findUniqueOrThrow({ where: { id: i1.id } });
  await pay(i1.id, "cash", d1.patientAmount.toFixed(2), "50");
  // 2. „მედპოლისი“: კონსულტაცია (100%, ლიმიტი 40) + ეკგ + ექოკარდიოგრაფია (არ ფარავს) → ნაწილობრივ ბარათით
  const i2 = await invoice(1, [["კარდიოლოგის კონსულტაცია", 1, "0"], ["ელექტროკარდიოგრაფია (ეკგ)", 1, "0"], ["ექოკარდიოგრაფია", 1, "0"]]);
  await pay(i2.id, "card", "60");
  // 3. დაზღვევის გარეშე, 10% ფასდაკლებით → გადაუხდელი (ვალი)
  await invoice(2, [["ბიოქიმიური ანალიზი (პანელი)", 1, "10"], ["გლუკოზა სისხლში", 1, "0"]]);
  // 4. ინექცია ×3 → ნაღდით, შემდეგ ნაწილობრივი დაბრუნება
  const i4 = await invoice(4, [["კუნთშიდა ინექცია", 3, "0"]]);
  await pay(i4.id, "cash", "30");
  await tx((t) =>
    refundPayment(t, { invoiceId: i4.id, method: "cash", amount: "10", reason: "ერთი ინექცია არ ჩატარდა", cardReference: null }, userId),
  );
  // 5. გაუქმებული ინვოისი
  const i5 = await invoice(7, [["გულმკერდის რენტგენოგრაფია", 1, "0"]]);
  await tx((t) => cancelInvoice(t, i5.id, "შეცდომით შეიქმნა", userId));
  // 6. „ოჯახის დაზღვევა“: პროცედურები (100%, ლიმიტი 15) → ბარათით სრულად
  const i6 = await invoice(5, [["ჭრილობის დამუშავება", 1, "0"], ["მუცლის ღრუს ექოსკოპია", 1, "0"]]);
  const d6 = await prisma.invoice.findUniqueOrThrow({ where: { id: i6.id } });
  await pay(i6.id, "card", d6.patientAmount.toFixed(2));
  // 7. ვადაგასული პოლისი → დაზღვევის გარეშე, გადაუხდელი
  await invoice(6, [["ენდოკრინოლოგის კონსულტაცია", 1, "0"], ["ფარისებრი ჯირკვლის ჰორმონი (TSH)", 1, "0"]]);

  // ცვლის დახურვა: ფაქტობრივი = მოსალოდნელი (სხვაობის გარეშე), თუ ჩვენ გავხსენით
  if (!existingShift) {
    const shift = await prisma.cashShift.findUniqueOrThrow({ where: { id: shiftId }, include: { payments: true } });
    const cash = shift.payments
      .filter((p) => p.method === "cash")
      .reduce((s, p) => s + (p.type === "payment" ? 1 : -1) * Number(p.amount), Number(shift.openingCash));
    await tx((t) => closeShift(t, shiftId, userId, cash.toFixed(2), null));
  }

  const invoices = await prisma.invoice.findMany({
    where: { comment: SEED_COMMENT },
    select: { invoiceNumber: true, status: true, totalAmount: true, insuranceAmount: true, patientAmount: true },
    orderBy: { id: "asc" },
  });
  console.log("✔ სატესტო ინვოისები:");
  console.table(
    invoices.map((i) => ({
      ნომერი: i.invoiceNumber,
      სტატუსი: i.status,
      ჯამი: i.totalAmount.toFixed(2),
      დაზღვევა: i.insuranceAmount.toFixed(2),
      პაციენტი: i.patientAmount.toFixed(2),
    })),
  );
}

main()
  .catch((err) => {
    console.error("✖ ფინანსების სატესტო მონაცემები ვერ ჩაიწერა:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
