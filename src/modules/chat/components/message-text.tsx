import { linkify } from "@/modules/chat/linkify";

/** შეტყობინების ტექსტი: ხაზები ინახება, ბმულები აქტიურია. HTML არ რენდერდება (მხოლოდ React-ის ტექსტი). */
export function MessageText({ text, highlight }: { text: string; highlight?: string }) {
  return (
    <span className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
      {linkify(text).map((part, i) =>
        part.type === "link" ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:opacity-80">
            {part.value}
          </a>
        ) : (
          <Highlighted key={i} text={part.value} query={highlight} />
        ),
      )}
    </span>
  );
}

/** ძებნის სიტყვის მონიშვნა (რეგისტრის მიუხედავად). */
export function Highlighted({ text, query }: { text: string; query?: string }) {
  const q = query?.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let from = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, from)) {
    if (i > from) out.push(text.slice(from, i));
    out.push(
      <mark key={i} className="rounded-sm bg-amber-200 text-inherit dark:bg-amber-500/40">
        {text.slice(i, i + q.length)}
      </mark>,
    );
    from = i + q.length;
  }
  out.push(text.slice(from));
  return <>{out}</>;
}
