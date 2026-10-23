/**
 * ბრაუზერის API-ები, რომლებიც მხოლოდ „დაცულ“ გვერდზე (HTTPS ან localhost) არსებობს. ლოკალურ ქსელში
 * (http://10.1.20.x:3000 — ტელეფონი, სხვა კომპიუტერი) crypto.randomUUID და navigator.clipboard არ არის — აქ მათი სათადარიგოა.
 */

/** 16 შემთხვევითი ბაიტი → UUID v4 სტრიქონი (ვერსიისა და ვარიანტის ბიტებით). */
export function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** UUID v4: crypto.randomUUID, ან (http-ზე) crypto.getRandomValues — ის ყველგან ხელმისაწვდომია. */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}

/** ტექსტის კოპირება: navigator.clipboard, ან (http-ზე) ძველი execCommand("copy"). */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy failed");
  } finally {
    area.remove();
  }
}
