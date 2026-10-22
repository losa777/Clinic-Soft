/** ალერგიის შემოწმება მედიკამენტის დანიშვნისას — სუფთა ფუნქცია (ტესტებისთვის დამოკიდებულებების გარეშე). */

/**
 * მედიკამენტი ემთხვევა თუ არა ალერგიას: დასახელება შეიცავს ნივთიერებას ან პირიქით (დიდი/პატარა ასოს გარეშე,
 * მინ. 3 სიმბოლო). მაგ. ალერგია „პენიცილინი“ ↔ „პენიცილინი G“; „ამოქსიცილინი“ ↔ „ამოქსიცილინი 500 მგ“.
 * ჯგუფურ ალერგიას (მაგ. ბეტა-ლაქტამები) ვერ ამოიცნობს — ეს გაფრთხილებაა, არა გადაწყვეტილება.
 */
export function allergyMatches(drugName: string, substances: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-.,()]+/g, " ").trim();
  const drug = norm(drugName);
  return substances.filter((s) => {
    const sub = norm(s);
    return sub.length >= 3 && drug.length >= 3 && (drug.includes(sub) || sub.includes(drug));
  });
}
