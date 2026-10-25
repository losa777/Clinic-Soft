/**
 * პრობლემების ვალიდაცია (zod) — საერთო ბრაუზერისა და სერვერისთვის.
 * ბაზასთან დაკავშირებული შემოწმებები (კატეგორია აქტიურია, მოქმედება დაშვებულია) — სერვერზე, ტრანზაქციაში.
 */
import { z } from "zod";
import { COMMENT_MAX, DESCRIPTION_MAX, ISSUE_PRIORITIES, LOCATION_MAX, RESOLUTION_MAX, TITLE_MAX } from "./labels.ts";
import { ISSUE_ACTION_CODES } from "./rules.ts";

const id = (message: string) => z.number({ error: message }).int().positive(message);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `მაქსიმუმ ${max} სიმბოლო`)
    .transform((v) => v || null);

const priority = z.enum(ISSUE_PRIORITIES.map((p) => p.value) as [string, ...string[]], { error: "აირჩიეთ პრიორიტეტი" });

export const issueSchema = z.object({
  title: z.string().trim().min(3, "მოკლედ დაწერეთ, რა მოხდა").max(TITLE_MAX, `მაქსიმუმ ${TITLE_MAX} სიმბოლო`),
  categoryId: id("აირჩიეთ კატეგორია"),
  priority,
  location: optionalText(LOCATION_MAX),
  description: optionalText(DESCRIPTION_MAX),
  /** გვერდი, საიდანაც გაიხსნა ფორმა (მხოლოდ ამ საიტის მისამართი) */
  sourcePath: z
    .string()
    .nullish()
    .transform((v) => (v && v.length <= 255 && v.startsWith("/") && !v.startsWith("//") ? v : null)),
});
export type IssueInput = z.input<typeof issueSchema>;

export const issueActionSchema = z.object({
  issueId: id("ბილეთი ვერ მოიძებნა"),
  action: z.enum(ISSUE_ACTION_CODES as [string, ...string[]], { error: "მოქმედება არასწორია" }),
  text: optionalText(RESOLUTION_MAX),
});
export type IssueActionInput = z.input<typeof issueActionSchema>;

export const commentSchema = z.object({
  issueId: id("ბილეთი ვერ მოიძებნა"),
  body: z.string().trim().max(COMMENT_MAX, `მაქსიმუმ ${COMMENT_MAX} სიმბოლო`),
});
export type CommentInput = z.input<typeof commentSchema>;

/** გადაცემა: კატეგორია (→ მიმღები როლი), პრიორიტეტი, კონკრეტული შემსრულებელი (null — როლის ნებისმიერი წევრი). */
export const routeSchema = z.object({
  issueId: id("ბილეთი ვერ მოიძებნა"),
  categoryId: id("აირჩიეთ კატეგორია"),
  priority,
  assigneeId: z.number().int().positive().nullable(),
});
export type RouteInput = z.input<typeof routeSchema>;

export const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "შეიყვანეთ დასახელება").max(100, "მაქსიმუმ 100 სიმბოლო"),
  assigneeRoleId: z.number({ error: "აირჩიეთ, ვის მიდის" }).int().positive("აირჩიეთ, ვის მიდის"),
  isConfidential: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});
export type CategoryInput = z.input<typeof categorySchema>;
