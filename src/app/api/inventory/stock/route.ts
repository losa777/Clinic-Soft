import { tbilisiToday } from "@/lib/appointment-slots";
import { apiPermission, csvResponse } from "@/modules/finance/server/csv";
import { CATEGORY_LABELS } from "@/modules/inventory/labels";
import { loadStock } from "@/modules/inventory/server/stock";
import { inputQuantity } from "@/modules/inventory/stock";

/** ნაშთების CSV (inventory.reports): ყველა დასახელება, ღირებულებით. */
export async function GET() {
  const denied = await apiPermission("inventory.reports");
  if (denied) return denied;
  const rows = await loadStock();
  return csvResponse(
    `stock-${tbilisiToday()}.csv`,
    ["დასახელება", "კატეგორია", "ერთეული", "ვარგისი ნაშთი", "ვადაგასული", "მინიმუმი", "უახლოესი ვადა", "ღირებულება (₾)", "სტატუსი"],
    rows.map((r) => [
      r.name,
      CATEGORY_LABELS[r.category],
      r.unit,
      inputQuantity(r.usable),
      inputQuantity(r.expired),
      inputQuantity(r.minQuantity),
      r.nextExpiry,
      (r.valueTetri / 100).toFixed(2),
      r.isActive ? "აქტიური" : "გათიშული",
    ]),
  );
}
