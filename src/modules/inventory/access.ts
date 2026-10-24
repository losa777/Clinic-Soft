import { can } from "@/lib/permissions";
import { isMedical, type InventoryCategoryValue } from "@/modules/inventory/labels";

type User = { roleCode: string; permissions: string[] };

/**
 * სამეურნეო საქონელი (საკანცელარიო, სამეურნეო): გასცემს მხოლოდ საწყობი/ადმინი (inventory.manage),
 * ხედავს ანგარიშების როლიც (inventory.reports — ბუღალტერი, დირექტორი). ექთანი/ლაბორანტი — მხოლოდ სამედიცინოს.
 */
export const managesGeneral = (user: User) => can(user, "inventory.manage");
export const seesGeneral = (user: User) => managesGeneral(user) || can(user, "inventory.reports");

/** მომხმარებელს ეს კატეგორია ჩანს. */
export const seesCategory = (user: User, category: InventoryCategoryValue) => isMedical(category) || seesGeneral(user);
