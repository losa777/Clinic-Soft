import type { SystemEvent, UserRef } from "@/modules/chat/types";
import { MESSAGE_MAX_LENGTH, PREVIEW_LENGTH } from "./config.ts";

/** ჩატის ტექსტები და ფორმატირება (სერვერი და ბრაუზერი). სუფთა ფუნქციები, ტესტებით. */

export const DELETED_TEXT = "შეტყობინება წაიშალა";
export const ATTACHMENT_TEXT = "📎 ფაილი";

export function fullName(u: Pick<UserRef, "firstName" | "lastName">): string {
  return `${u.firstName} ${u.lastName}`.trim();
}

/**
 * შეტყობინების ტექსტის ნორმალიზაცია: \r\n → \n, საკონტროლო სიმბოლოები (გარდა \n და \t) იშლება,
 * კიდეებზე ცარიელი ადგილი და ზედმეტი ცარიელი ხაზები (3+) — იკვეცება.
 */
export function normalizeBody(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2028\u2029]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isBodyTooLong(text: string): boolean {
  return text.length > MESSAGE_MAX_LENGTH;
}

/** ჯგუფის სისტემური შეტყობინება (მოქმედებითი ბრუნვის გარეშე — სახელის ფორმა არ იცვლება). */
export function systemText(event: SystemEvent | string | null, actor: string, target: string | null, body: string | null): string {
  switch (event) {
    case "created":
      return `${actor} — ჯგუფი შეიქმნა: „${body ?? ""}“`;
    case "renamed":
      return `${actor} — ჯგუფის ახალი სახელი: „${body ?? ""}“`;
    case "member_added":
      return `ჯგუფს დაემატა: ${target ?? "თანამშრომელი"}`;
    case "member_removed":
      return `ჯგუფიდან ამოიშალა: ${target ?? "თანამშრომელი"}`;
    case "member_left":
      return `${actor} გავიდა ჯგუფიდან`;
    default:
      return "";
  }
}

/** ერთ ხაზად, მაქსიმუმ max სიმბოლო (სიის ნაწყვეტი, quote, notification). */
export function snippet(text: string, max = PREVIEW_LENGTH): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** სიაში ნაჩვენები ბოლო შეტყობინების ტექსტი. */
export function previewText(m: {
  kind: string;
  body: string | null;
  deleted: boolean;
  event: string | null;
  actorName: string;
  targetName: string | null;
  attachments: number;
}): string {
  if (m.kind === "system") return snippet(systemText(m.event, m.actorName, m.targetName, m.body));
  if (m.deleted) return DELETED_TEXT;
  const text = m.body ? snippet(m.body) : "";
  if (text) return text;
  return m.attachments > 0 ? ATTACHMENT_TEXT : "";
}
