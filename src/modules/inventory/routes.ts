/**
 * საწყობის გვერდების მისამართები როლის მიხედვით (ყოველი როლის გვერდი /<როლი>/-შია, proxy.ts).
 * null — ამ როლს ეს გვერდი არ აქვს (ბმული/ღილაკი არ ჩანს). ღილაკები უფლებებითაც იმალება (can()).
 * ახალი როლისთვის: ჩანაწერი აქ + გვერდები src/app/(dashboard)/<როლი>/ (ნიმუში — nurse/inventory).
 */
export type InventoryRoutes = {
  stock: string;
  items: string;
  receive: string | null;
  issue: string | null;
  movements: string | null;
  count: string | null;
  norms: string | null;
  catalog: string | null;
};

/** საწყობის მართვა: ყველა გვერდი. */
const full = (base: string): InventoryRoutes => ({
  stock: base,
  items: `${base}/items`,
  receive: `${base}/receive`,
  issue: `${base}/issue`,
  movements: `${base}/movements`,
  count: `${base}/count`,
  norms: `${base}/norms`,
  catalog: `${base}/catalog`,
});

/** ექთანი/ლაბორანტი: ნაშთი და ხელით გახარჯვა (პროცედურისას — რიგიდან). */
const consumer = (base: string): InventoryRoutes => ({
  stock: base,
  items: `${base}/items`,
  receive: null,
  issue: `${base}/issue`,
  movements: null,
  count: null,
  norms: null,
  catalog: null,
});

/** ბუღალტერი/დირექტორი: ნაშთი, ღირებულება, მოძრაობები — მხოლოდ სანახავად. */
const viewer = (base: string): InventoryRoutes => ({
  stock: base,
  items: `${base}/items`,
  receive: null,
  issue: null,
  movements: `${base}/movements`,
  count: null,
  norms: null,
  catalog: null,
});

export const INVENTORY_ROUTES = {
  warehouse: full("/warehouse"),
  admin: full("/admin/inventory"),
  nurse: consumer("/nurse/inventory"),
  lab: consumer("/lab/inventory"),
  accountant: viewer("/accountant/inventory"),
  director: viewer("/director/inventory"),
} satisfies Record<string, InventoryRoutes>;

/** შეტყობინების ბმულისთვის: როლის კოდი → მისამართები (როლს საწყობის გვერდი თუ არ აქვს — null). */
export function inventoryRoutesFor(roleCode: string): InventoryRoutes | null {
  return Object.hasOwn(INVENTORY_ROUTES, roleCode) ? INVENTORY_ROUTES[roleCode as keyof typeof INVENTORY_ROUTES] : null;
}

export const itemUrl = (r: InventoryRoutes, id: number) => `${r.items}/${id}`;
