/** ელემენტების დალაგება შენახული რიგით (id-ები); რიგში არმყოფი (ახალი) — ბოლოს, თავდაპირველი რიგით. სუფთა ფუნქცია, ტესტებით. */
export function applyOrder<T>(items: T[], order: number[], idOf: (item: T) => number): T[] {
  const index = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (index.get(idOf(a.item)) ?? order.length + a.i) - (index.get(idOf(b.item)) ?? order.length + b.i))
    .map((x) => x.item);
}
