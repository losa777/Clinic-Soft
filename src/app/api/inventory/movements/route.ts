import { periodParams, positiveInt } from "@/modules/finance/params";
import { apiPermission, csvResponse } from "@/modules/finance/server/csv";
import { GROUP_FILTERS, type GroupFilter, MOVEMENT_LABELS, MOVEMENT_TYPES, type MovementTypeValue, REASON_LABELS } from "@/modules/inventory/labels";
import { exportMovements } from "@/modules/inventory/server/stock";
import { inputQuantity } from "@/modules/inventory/stock";

/** მოძრაობების CSV (inventory.reports): იგივე ფილტრები, რაც გვერდზე (?from=&to=&type=&item=). */
export async function GET(request: Request) {
  const denied = await apiPermission("inventory.reports");
  if (denied) return denied;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const period = periodParams(params, 30);
  const type = MOVEMENT_TYPES.some((t) => t.value === params.type) ? (params.type as MovementTypeValue) : null;
  const group = GROUP_FILTERS.some((g) => g.value === params.group) ? (params.group as GroupFilter) : "all";
  const rows = await exportMovements({ ...period, type, itemId: positiveInt(params.item), group, page: 1 });
  return csvResponse(
    `inventory-movements-${period.from}-${period.to}.csv`,
    ["დრო", "დასახელება", "ოპერაცია", "რაოდენობა", "ერთეული", "სერია", "ვადა", "მიზეზი", "მომწოდებელი", "ზედნადები", "პაციენტი", "ვის/სად გაიცა", "შენიშვნა", "თანამშრომელი"],
    rows.map((m) => [
      m.at,
      m.itemName,
      MOVEMENT_LABELS[m.type],
      inputQuantity(m.quantity),
      m.unit,
      m.lotNumber,
      m.expiryDate,
      m.reason ? REASON_LABELS[m.reason] : null,
      m.supplier,
      m.documentNumber,
      m.patient,
      m.recipient,
      m.note,
      m.user,
    ]),
  );
}
