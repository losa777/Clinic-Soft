/**
 * პირველადი პაციენტების დაბალანსება სპეციალობის შიგნით: სტატისტიკის ტიპები, პროცენტი და რეკომენდებული ექიმი.
 * „პირველადი“ — პაციენტს ამ დღემდე კლინიკაში ვიზიტი (ჯავშანი/ინვოისი) არ ჰქონია (src/lib/first-visits.ts).
 * სუფთა მოდული (სერვერი, ბრაუზერი, ტესტები).
 */

/** ექიმი დღის სტატისტიკაში: first — პირველადი, all — ყველა ვიზიტი; works — ამ დღეს გრაფიკით მუშაობს. */
export type FirstVisitDoctor = { doctorId: number; name: string; room: string | null; first: number; all: number; works: boolean };
export type FirstVisitSpecialty = { id: number; name: string; first: number; doctors: FirstVisitDoctor[] };
export type FirstVisitStats = { date: string; first: number; all: number; specialties: FirstVisitSpecialty[] };

/** ექიმის წილი სპეციალობის პირველადებიდან (0–100, მთელი). */
export const sharePercent = (first: number, total: number) => (total ? Math.round((first / total) * 100) : 0);

/**
 * რეკომენდებული ექიმი: მომუშავეებიდან — ყველაზე ნაკლები პირველადი, თანაბარზე — ნაკლები ვიზიტი ჯამში, მერე — სახელით.
 * ერთზე ნაკლები მომუშავე ან ყველას თანაბარი (და ერთნაირი დატვირთვა) — null (რჩევა აზრს კარგავს).
 */
export function recommendDoctor(doctors: readonly FirstVisitDoctor[]): FirstVisitDoctor | null {
  const working = doctors.filter((d) => d.works);
  if (working.length < 2) return null;
  const sorted = [...working].sort((a, b) => a.first - b.first || a.all - b.all || a.name.localeCompare(b.name, "ka"));
  const [best, next] = sorted;
  return best.first === next.first && best.all === next.all && sorted.every((d) => d.first === best.first && d.all === best.all) ? null : best;
}
