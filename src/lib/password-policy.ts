import { z } from "zod";

/**
 * პაროლის წესი (სერვერი და ბრაუზერი): მინიმუმ 8 სიმბოლო, ასო და ციფრი, არ შეიცავს მომხმარებლის სახელს.
 * გამოიყენება საკუთარი პაროლის შეცვლისას და ადმინის მიერ პაროლის დაყენებისას.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export const PASSWORD_HINT = `მინიმუმ ${PASSWORD_MIN} სიმბოლო: ასო და ციფრი`;

/** პირველი დარღვეული წესი ან null. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN) return `პაროლი მინიმუმ ${PASSWORD_MIN} სიმბოლო`;
  if (password.length > PASSWORD_MAX) return "პაროლი ძალიან გრძელია";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "პაროლში უნდა იყოს ასოც და ციფრიც";
  if (username && username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) return "პაროლი არ უნდა შეიცავდეს მომხმარებლის სახელს";
  return null;
}

export const passwordSchema = z.string().superRefine((v, ctx) => {
  const problem = passwordProblem(v);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "შეიყვანეთ ამჟამინდელი პაროლი").max(PASSWORD_MAX),
    next: passwordSchema,
    repeat: z.string(),
  })
  .refine((v) => v.next === v.repeat, { path: ["repeat"], message: "პაროლები არ ემთხვევა" })
  .refine((v) => v.next !== v.current, { path: ["next"], message: "ახალი პაროლი ძველს არ უნდა ემთხვეოდეს" });

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
