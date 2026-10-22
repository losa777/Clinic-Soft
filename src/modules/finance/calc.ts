/**
 * ფინანსური გამოთვლები — სუფთა ფუნქციები (ბაზის გარეშე), საერთო სერვერისა და კლიენტისთვის (კლიენტზე მხოლოდ ჩვენებისთვის;
 * შენახვისას ყველაფერი სერვერზე თავიდან ითვლება).
 *
 * თანხები თეთრებშია (მთელი რიცხვები) — float-ის ცდომილება არ ხდება. პროცენტის გამოთვლა BigInt-ით, დამრგვალება
 * უახლოეს თეთრამდე (0.5 — ზევით). DECIMAL(12,2) ↔ სტრიქონი "123.45" ↔ თეთრი 12345.
 */

export type Tetri = number;

/** "12.5", "12,50", 12.5 → 1250. */
export function toTetri(amount: string | number): Tetri {
  const s = typeof amount === "number" ? amount.toFixed(2) : amount.trim().replace(",", ".");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!match) throw new Error(`არასწორი თანხა: ${amount}`);
  const value = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -value : value;
}

/** 1250 → "12.50" (DECIMAL-ისთვის და კლიენტზე გადასაცემად). */
export function fromTetri(tetri: Tetri): string {
  const sign = tetri < 0 ? "-" : "";
  const abs = Math.abs(tetri);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** პროცენტი (0–100, მაქს. 2 ათწილადი) → მეასედები: "12.5" → 1250. */
function percentHundredths(percent: string | number): bigint {
  const hundredths = toTetri(percent);
  if (hundredths < 0 || hundredths > 10_000) throw new Error(`პროცენტი 0–100 უნდა იყოს: ${percent}`);
  return BigInt(hundredths);
}

/** თანხის პროცენტი, დამრგვალებული თეთრამდე: percentOf(1001, 50) → 501. */
export function percentOf(amount: Tetri, percent: string | number): Tetri {
  if (amount < 0) throw new Error("თანხა უარყოფითია");
  // amount × p / 10000, 0.5-ზე ზევით: (2·amount·p + 10000) / 20000 (BigInt literal-ები tsconfig-ის ES2017 target-ში არ არის)
  return Number((BigInt(2) * BigInt(amount) * percentHundredths(percent) + BigInt(10_000)) / BigInt(20_000));
}

/** დაზღვევის პირობა სერვისისთვის: დაფარვის პროცენტი და ლიმიტი სერვისის ერთეულზე (null — ლიმიტის გარეშე). */
export type Coverage = { percent: string; limit: string | null };

export type LineInput = {
  unitPrice: Tetri;
  quantity: number;
  /** ფასდაკლება პროცენტებში (0–100) */
  discountPercent: string | number;
  /** null — დაზღვევა არ ფარავს */
  coverage: Coverage | null;
};

export type LineAmounts = {
  /** ფასი × რაოდენობა */
  gross: Tetri;
  discount: Tetri;
  /** gross − discount = insurance + patient */
  total: Tetri;
  insurance: Tetri;
  patient: Tetri;
};

/**
 * ინვოისის ხაზი: ჯერ ფასდაკლება, მერე დაზღვევის წილი ფასდაკლებული თანხიდან.
 * დაზღვევის წილი ლიმიტს ვერ გადააჭარბებს: ლიმიტი × რაოდენობა.
 */
export function calcLine({ unitPrice, quantity, discountPercent, coverage }: LineInput): LineAmounts {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("რაოდენობა მინიმუმ 1");
  if (!Number.isInteger(unitPrice) || unitPrice < 0) throw new Error("ფასი არასწორია");
  const gross = unitPrice * quantity;
  const discount = percentOf(gross, discountPercent);
  const total = gross - discount;
  let insurance = coverage ? percentOf(total, coverage.percent) : 0;
  if (coverage?.limit != null) insurance = Math.min(insurance, toTetri(coverage.limit) * quantity);
  return { gross, discount, total, insurance, patient: total - insurance };
}

export type InvoiceAmounts = { total: Tetri; discount: Tetri; insurance: Tetri; patient: Tetri };

export function sumLines(lines: LineAmounts[]): InvoiceAmounts {
  return lines.reduce(
    (sum, l) => ({
      total: sum.total + l.total,
      discount: sum.discount + l.discount,
      insurance: sum.insurance + l.insurance,
      patient: sum.patient + l.patient,
    }),
    { total: 0, discount: 0, insurance: 0, patient: 0 },
  );
}

/**
 * სადაზღვევო პირობის არჩევა სერვისისთვის: სერვისის პირობა უპირატესია კატეგორიისაზე; არცერთი — არ ფარავს.
 */
export function resolveCoverage<T extends { serviceId: number | null; categoryId: number | null; percent: string; limit: string | null }>(
  contracts: T[],
  service: { id: number; categoryId: number | null },
): Coverage | null {
  const match =
    contracts.find((c) => c.serviceId === service.id) ??
    (service.categoryId != null ? contracts.find((c) => c.serviceId === null && c.categoryId === service.categoryId) : undefined);
  return match ? { percent: match.percent, limit: match.limit } : null;
}

export type PaymentRecord = { type: "payment" | "refund"; amount: Tetri };

/** გადახდილი (გადახდები − დაბრუნებები). */
export function netPaid(payments: PaymentRecord[]): Tetri {
  return payments.reduce((sum, p) => sum + (p.type === "payment" ? p.amount : -p.amount), 0);
}

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "cancelled";

/** სტატუსი პაციენტის წილისა და გადახდილის მიხედვით (გაუქმებული ცალკე მოქმედებაა). */
export function invoiceStatus(patientAmount: Tetri, paid: Tetri): Exclude<InvoiceStatus, "cancelled"> {
  if (paid >= patientAmount) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

/** პაციენტის ვალი ინვოისზე: გადაუხდელი პაციენტის წილი (0-ზე ნაკლები არ ხდება). */
export function invoiceDebt(patientAmount: Tetri, paid: Tetri): Tetri {
  return Math.max(0, patientAmount - paid);
}

/** გადახდის შემოწმება: შეცდომის ტექსტი ან null. ზედმეტი გადახდა არ მიიღება. */
export function checkPayment(debt: Tetri, amount: Tetri): string | null {
  if (amount <= 0) return "თანხა 0-ზე მეტი უნდა იყოს";
  if (debt <= 0) return "ინვოისი უკვე გადახდილია";
  if (amount > debt) return `თანხა დავალიანებას (${fromTetri(debt)} ₾) აღემატება`;
  return null;
}

/** ნაღდი: მიღებული თანხა ≥ გადასახდელი; ხურდა = მიღებული − თანხა. */
export function cashChange(amount: Tetri, received: Tetri): { ok: true; change: Tetri } | { ok: false; error: string } {
  if (received < amount) return { ok: false, error: `მიღებული თანხა (${fromTetri(received)} ₾) გადასახდელზე ნაკლებია` };
  return { ok: true, change: received - amount };
}

/** დაბრუნება: მაქსიმუმ გადახდილი (წმინდა) თანხა; ნაღდით — მაქსიმუმ ის, რაც ნაღდით იყო გადახდილი. */
export function checkRefund(amount: Tetri, paid: Tetri, paidByMethod?: Tetri): string | null {
  if (amount <= 0) return "თანხა 0-ზე მეტი უნდა იყოს";
  if (paid <= 0) return "ინვოისზე გადახდილი თანხა არ არის";
  if (amount > paid) return `დასაბრუნებელი თანხა გადახდილს (${fromTetri(paid)} ₾) აღემატება`;
  if (paidByMethod !== undefined && amount > paidByMethod) {
    return `ამ მეთოდით გადახდილია მხოლოდ ${fromTetri(Math.max(0, paidByMethod))} ₾`;
  }
  return null;
}

/** ცვლის დახურვა: მოსალოდნელი ნაღდი = საწყისი + ნაღდი გადახდები − ნაღდი დაბრუნებები; სხვაობა = ფაქტობრივი − მოსალოდნელი. */
export function shiftExpectedCash(opening: Tetri, cashPayments: Tetri, cashRefunds: Tetri): Tetri {
  return opening + cashPayments - cashRefunds;
}

export function shiftDifference(actual: Tetri, expected: Tetri): Tetri {
  return actual - expected;
}

/**
 * ბარათის ველი: მხოლოდ ტრანზაქციის ნომერი ან ბოლო 4 ციფრი. სრული ბარათის ნომერი (13–19 ციფრი ზედიზედ,
 * ჰარებით/დეფისებითაც) არ მიიღება — PCI DSS.
 */
export function checkCardReference(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > 30 || !/^[A-Za-z0-9 -]+$/.test(v)) return "მხოლოდ ლათინური ასოები, ციფრები, ჰარი და დეფისი (მაქს. 30)";
  if (/\d{13,}/.test(v.replace(/[\s-]/g, ""))) return "ბარათის სრული ნომერი არ შეიყვანოთ — მხოლოდ ბოლო 4 ციფრი ან ტრანზაქციის ნომერი";
  return null;
}
