/**
 * ჩატის პარამეტრები (სერვერი და ბრაუზერი). სუფთა მოდული — ტესტებიდანაც იკითხება.
 * სერვერის მხარის ცვლადები (.env.local) — src/modules/chat/realtime/presence-store.ts.
 */

/** Socket.IO-ს მისამართი. Next-ის არცერთ მარშრუტს არ უნდა ემთხვეოდეს (სხვაგვარად Next upgrade-ს დახურავს). */
export const CHAT_SOCKET_PATH = "/api/chat/socket";

export const MESSAGE_MAX_LENGTH = 4000;
export const GROUP_NAME_MAX_LENGTH = 100;
export const GROUP_MAX_MEMBERS = 200;
/** ერთ მოთხოვნაში დასამატებელი მონაწილეები. */
export const MEMBERS_ADD_MAX = 50;

/** ისტორია ნაწილ-ნაწილ (cursor: შეტყობინების id). */
export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_PAGE_MAX = 100;
/** ხელახლა დაკავშირებისას გამოტოვებული შეტყობინებები — ერთ მოთხოვნაში მაქსიმუმ. */
export const MESSAGE_CATCH_UP_MAX = 200;

export const USER_SEARCH_LIMIT = 30;
export const MESSAGE_SEARCH_LIMIT = 30;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** სიაში ბოლო შეტყობინების ნაწყვეტი. */
export const PREVIEW_LENGTH = 120;
/** პასუხის (quote) ნაწყვეტი. */
export const QUOTE_LENGTH = 200;

/** „წერს...“: ბრაუზერი აგზავნის მაქსიმუმ ერთხელ TYPING_SEND_MS-ში, მიმღები აჩვენებს TYPING_SHOW_MS-ის განმავლობაში. */
export const TYPING_SEND_MS = 2_500;
export const TYPING_SHOW_MS = 5_000;

/** გაგზავნის/ცვლილებების ლიმიტი მომხმარებელზე: capacity მოქმედება windowMs-ში. */
export const RATE_LIMITS = {
  send: { capacity: 20, windowMs: 10_000 },
  mutate: { capacity: 30, windowMs: 10_000 },
  search: { capacity: 30, windowMs: 10_000 },
  typing: { capacity: 10, windowMs: 10_000 },
} as const;

export type RateLimitKind = keyof typeof RATE_LIMITS;

/**
 * ფაილები: ზომის ლიმიტი, რაოდენობა ერთ შეტყობინებაში და დაშვებული ტიპები (ტიპი მოწმდება შიგთავსით — files.ts).
 * ჯამი (FILES_PER_MESSAGE × FILE_MAX_BYTES) არ უნდა აჭარბებდეს next.config.ts-ის proxyClientMaxBodySize-ს (45 MB).
 */
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILES_PER_MESSAGE = 4;

export const ALLOWED_FILE_TYPES = [
  { mime: "image/jpeg", ext: "jpg", label: "JPG", image: true },
  { mime: "image/png", ext: "png", label: "PNG", image: true },
  { mime: "image/gif", ext: "gif", label: "GIF", image: true },
  { mime: "image/webp", ext: "webp", label: "WEBP", image: true },
  { mime: "application/pdf", ext: "pdf", label: "PDF", image: false },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", label: "DOCX", image: false },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx", label: "XLSX", image: false },
  { mime: "text/plain", ext: "txt", label: "TXT", image: false },
] as const;

export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];
