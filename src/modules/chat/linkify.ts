/**
 * ტექსტი → ნაწილები: ჩვეულებრივი ტექსტი და ბმულები (http/https/www). HTML არასოდეს რენდერდება —
 * კომპონენტი ნაწილებს React-ის ტექსტად და <a>-დ აჩენს. სხვა სქემები (javascript:, data:) ბმულად არ იქცევა.
 */
export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
/** ბოლოში მიწებებული სასვენი ნიშნები ბმულს არ ეკუთვნის: „იხ. https://x.ge/a.“ */
const TRAILING = /[.,;:!?»“”'")\]]+$/;

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let url = match[0];
    const trailing = url.match(TRAILING)?.[0] ?? "";
    // დახურვის ფრჩხილი რჩება, თუ ბმულში გახსნილიც არის (მაგ. ვიკიპედიის მისამართები)
    const keepParen = trailing.startsWith(")") && url.slice(0, -trailing.length).includes("(");
    if (trailing && !keepParen) url = url.slice(0, -trailing.length);
    const start = match.index;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", value: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
