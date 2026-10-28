/** ხანგრძლივობა წუთებში ტექსტად: „ახლახან“, „15 წთ“, „1 სთ 5 წთ“ (სერვერი და ბრაუზერი). */
export function minutesText(minutes: number): string {
  if (minutes < 1) return "ახლახან";
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} სთ ${minutes % 60} წთ` : `${minutes} წთ`;
}
