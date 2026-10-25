/**
 * „ცოცხალი“ განახლება: სერვერი სოკეტით (ჩატის კავშირი) აცნობებს, რომ მონაცემები შეიცვალა — ღია გვერდები თავად
 * ახლდება (src/components/live-refresh.tsx). სიგნალში მხოლოდ თემაა, პაციენტის მონაცემები არა.
 */
export type LiveTopic = "appointments" | "invoices" | "orders" | "inventory" | "issues";

/** doctorUserIds — ჯავშნის/რიგის ცვლილება ამ ექიმებს ეხება (ექიმის რიგი მხოლოდ თავისზე ახლდება); არ არის — ყველას. */
export type LiveEvent = { topics: LiveTopic[]; doctorUserIds?: number[] };
