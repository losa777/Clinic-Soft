/** მომხმარებლისთვის განკუთვნილი შეცდომა ჩატის API-დან: ტექსტი ეკრანზე ჩანს, status — HTTP კოდი. */
export class ChatError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 413 | 429 = 400,
  ) {
    super(message);
  }
}

/** უცხო ან არარსებული საუბარი — ერთნაირი პასუხი (არსებობა არ უნდა გამჟღავნდეს). */
export const conversationNotFound = () => new ChatError("საუბარი ვერ მოიძებნა", 404);
export const messageNotFound = () => new ChatError("შეტყობინება ვერ მოიძებნა", 404);
