/**
 * ფინანსების მოდულის ტიპები — საერთო სერვერისა და კლიენტისთვის. თანხები სტრიქონად ("12.50"), თარიღები ფორმატირებული.
 */
import type { Coverage } from "@/modules/finance/calc";

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "cancelled";
export type PaymentType = "payment" | "refund";
export type PaymentMethod = "cash" | "card";
export type VisitType = "outpatient" | "day_hospital";

/** ბანკი ბარათით გადახდისთვის (ადმინი → „ბანკები“). */
export type BankOption = { id: number; name: string };
export type BankRow = BankOption & { isActive: boolean; sortOrder: number; payments: number };
/** ბანკიდან შემოსული თანხები (ბარათით): bankId null — ბანკი მითითებული არ არის (ძველი გადახდები). */
export type BankTotal = { bankId: number | null; name: string; payments: string; refunds: string; net: string; count: number };

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "unpaid", label: "გადაუხდელი" },
  { value: "partial", label: "ნაწილობრივ გადახდილი" },
  { value: "paid", label: "გადახდილი" },
  { value: "cancelled", label: "გაუქმებული" },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "ნაღდი" },
  { value: "card", label: "ბარათი" },
];

export const VISIT_TYPES: { value: VisitType; label: string }[] = [
  { value: "outpatient", label: "ამბულატორიული" },
  { value: "day_hospital", label: "დღის სტაციონარი" },
];

const labelOf = <T extends string>(list: { value: T; label: string }[], value: string) => list.find((i) => i.value === value)?.label ?? value;
export const invoiceStatusLabel = (s: string) => labelOf(INVOICE_STATUSES, s);
export const paymentMethodLabel = (m: string) => labelOf(PAYMENT_METHODS, m);
export const visitTypeLabel = (t: string) => labelOf(VISIT_TYPES, t);
export const paymentTypeLabel = (t: string) => (t === "refund" ? "დაბრუნება" : "გადახდა");

export type BillableService = {
  id: number;
  code: string | null;
  name: string;
  categoryId: number | null;
  category: string | null;
  price: string;
};

export type ActivePolicy = { id: number; companyId: number; companyName: string; policyNumber: string; validTo: string };

/** ინვოისის ფორმის მონაცემები (სერვერიდან). coverage — სერვისი → დაფარვა პაციენტის აქტიური პოლისით. */
export type InvoiceFormData = {
  patient: { id: number; name: string; personalId: string; debt: string };
  appointment: { id: number; label: string } | null;
  doctor: { id: number; name: string } | null;
  /** queue — ექიმს პროფილი აქვს: ჯავშნის გარეშე ინვოისით პაციენტი მის რიგში ჩადგება */
  doctors: { id: number; name: string; queue: boolean }[];
  services: BillableService[];
  /** ავტომატურად დამატებული სერვისები (მაგ. ექიმის კონსულტაცია ჯავშნიდან) */
  initialServiceIds: number[];
  policy: ActivePolicy | null;
  coverage: Record<number, Coverage>;
  defaultServiceDate: string;
  /** ჯავშნიდან შექმნისას უკვე არსებული (გაუქმებელი) ინვოისი */
  existingInvoice: { id: number; number: string } | null;
};

export type InvoiceListRow = {
  id: number;
  number: string;
  createdAt: string;
  patient: { id: number; name: string; personalId: string };
  status: InvoiceStatus;
  total: string;
  insurance: string;
  patientAmount: string;
  paid: string;
  debt: string;
};

export type PaymentRow = {
  id: number;
  receiptNumber: string;
  type: PaymentType;
  method: PaymentMethod;
  amount: string;
  receivedAmount: string | null;
  changeAmount: string | null;
  cardReference: string | null;
  /** ბარათით — ბანკის დასახელება */
  bank: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type InvoiceDetail = {
  id: number;
  number: string;
  status: InvoiceStatus;
  createdAt: string;
  createdBy: string | null;
  serviceDate: string;
  visitType: VisitType;
  doctorName: string | null;
  patient: { id: number; name: string; personalId: string; phone: string | null };
  /** rendered — ექიმმა მიღება დაიწყო/დაასრულა (გაუქმებას invoices.cancel_rendered სჭირდება) */
  appointment: { id: number; label: string; rendered: boolean } | null;
  insurance: { companyName: string; policyNumber: string | null } | null;
  insuranceDisabledReason: string | null;
  items: {
    id: number;
    code: string | null;
    name: string;
    quantity: number;
    unitPrice: string;
    discountPercent: string;
    discount: string;
    total: string;
    insurance: string;
    patient: string;
  }[];
  totals: { total: string; discount: string; insurance: string; patient: string; paid: string; debt: string };
  /** მეთოდის მიხედვით წმინდა გადახდილი (დაბრუნების ლიმიტისთვის) */
  paidByMethod: Record<PaymentMethod, string>;
  payments: PaymentRow[];
  comment: string | null;
  cancelled: { reason: string; by: string | null; at: string } | null;
};

export type ShiftSummary = {
  id: number;
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  cashPayments: string;
  cashRefunds: string;
  cardPayments: string;
  cardRefunds: string;
  operations: number;
  expectedCash: string;
  actualCash: string | null;
  difference: string | null;
  closeNote: string | null;
  status: "open" | "closed";
  cashier: string | null;
};

export type ReceiptData = {
  clinic: { name: string; legalName: string; taxId: string; address: string; phone: string; footer: string };
  receiptNumber: string;
  type: PaymentType;
  createdAt: string;
  cashier: string | null;
  invoiceNumber: string;
  patient: { name: string; personalId: string };
  items: { name: string; quantity: number; total: string; insurance: string; patient: string }[];
  totals: { total: string; insurance: string; patient: string };
  insurance: string | null;
  amount: string;
  method: PaymentMethod;
  receivedAmount: string | null;
  changeAmount: string | null;
  cardReference: string | null;
  bank: string | null;
  reason: string | null;
  /** ინვოისის ნარჩენი ვალი ამ ოპერაციის შემდეგ */
  remainingDebt: string;
  /** უკვე დაბეჭდილია — „დუბლიკატი“ */
  printCount: number;
};
