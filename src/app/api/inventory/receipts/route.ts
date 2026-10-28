import { periodParams, positiveInt } from "@/modules/finance/params";
import { apiPermission, csvResponse } from "@/modules/finance/server/csv";
import { CATEGORY_LABELS, GROUP_FILTERS, type GroupFilter, isMedical } from "@/modules/inventory/labels";
import { loadReceipts } from "@/modules/inventory/server/receipts";
import { inputQuantity } from "@/modules/inventory/stock";

/** ზედნადებების CSV (inventory.reports): ხაზი = პარტია, იგივე ფილტრები, რაც გვერდზე (?from=&to=&supplier=&group=). */
export async function GET(request: Request) {
  const denied = await apiPermission("inventory.reports");
  if (denied) return denied;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const period = periodParams(params, 30);
  const group = GROUP_FILTERS.some((g) => g.value === params.group) ? (params.group as GroupFilter) : "all";
  const { docs } = await loadReceipts({ ...period, supplierId: positiveInt(params.supplier), group });
  return csvResponse(
    `inventory-receipts-${period.from}-${period.to}.csv`,
    ["მიღების თარიღი", "მომწოდებელი", "ზედნადები", "დასახელება", "ჯგუფი", "კატეგორია", "რაოდენობა", "ერთეული", "ერთ. ფასი (₾)", "თანხა (₾)", "სერია", "ვადა", "შეიყვანა"],
    docs.flatMap((d) =>
      d.lines.map((l) => [
        d.receivedOn,
        d.supplier,
        d.documentNumber,
        l.itemName,
        isMedical(l.category) ? "სამედიცინო" : "სამეურნეო",
        CATEGORY_LABELS[l.category],
        inputQuantity(l.quantity),
        l.unit,
        l.unitCost,
        l.amountTetri === null ? null : (l.amountTetri / 100).toFixed(2),
        l.lotNumber,
        l.expiryDate,
        d.createdBy,
      ]),
    ),
  );
}
