import type { z } from "zod";

/** zod-ის შეცდომები → { ველი: პირველი შეტყობინება }. კლიენტზეც გამოიყენება. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? "")] ??= issue.message;
  return errors;
}
