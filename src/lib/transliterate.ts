/**
 * ქართული → ლათინური, საქართველოს ეროვნული ტრანსლიტერაციის სისტემით.
 * ყოველი სიტყვა (ჰარის ან დეფისის შემდეგ) დიდი ასოთი იწყება: „ნინო ბერიძე-კაპანაძე“ → „Nino Beridze-Kapanadze“.
 * ქართულის გარდა სხვა სიმბოლოები უცვლელად გადადის.
 */
const GEORGIAN_TO_LATIN: Record<string, string> = {
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i", კ: "k", ლ: "l",
  მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s", ტ: "t", უ: "u", ფ: "p", ქ: "k",
  ღ: "gh", ყ: "q", შ: "sh", ჩ: "ch", ც: "ts", ძ: "dz", წ: "ts", ჭ: "ch", ხ: "kh", ჯ: "j", ჰ: "h",
};

const WORD_SEPARATOR = /[\s-]/;

export function transliterate(text: string): string {
  let result = "";
  let wordStart = true;

  for (const char of text) {
    // მთავრული (Ა-Ჰ) toLowerCase-ით მხედრულზე გადადის
    const latin = GEORGIAN_TO_LATIN[char.toLowerCase()];
    if (latin) {
      result += wordStart ? latin[0].toUpperCase() + latin.slice(1) : latin;
      wordStart = false;
    } else {
      result += char;
      wordStart = WORD_SEPARATOR.test(char);
    }
  }
  return result;
}
