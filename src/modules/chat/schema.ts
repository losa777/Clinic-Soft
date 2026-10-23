import { z } from "zod";
import { GROUP_MAX_MEMBERS, GROUP_NAME_MAX_LENGTH, MEMBERS_ADD_MAX, MESSAGE_MAX_LENGTH, MESSAGE_PAGE_MAX, SEARCH_QUERY_MAX_LENGTH } from "./config.ts";
import { normalizeBody } from "./format.ts";

/** ჩატის API-ს შემავალი მონაცემები (სერვერზე მოწმდება ყოველ მოთხოვნაზე). */

const id = z.number({ error: "არასწორი იდენტიფიკატორი" }).int().positive().max(Number.MAX_SAFE_INTEGER);

const groupName = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "შეიყვანეთ ჯგუფის სახელი").max(GROUP_NAME_MAX_LENGTH, `სახელი — მაქსიმუმ ${GROUP_NAME_MAX_LENGTH} სიმბოლო`));

const body = z
  .string()
  .max(MESSAGE_MAX_LENGTH * 2, `შეტყობინება — მაქსიმუმ ${MESSAGE_MAX_LENGTH} სიმბოლო`)
  .transform(normalizeBody)
  .pipe(z.string().max(MESSAGE_MAX_LENGTH, `შეტყობინება — მაქსიმუმ ${MESSAGE_MAX_LENGTH} სიმბოლო`));

export const createConversationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("direct"), userId: id }),
  z.object({
    type: z.literal("group"),
    name: groupName,
    memberIds: z.array(id).min(1, "აირჩიეთ ერთი თანამშრომელი მაინც").max(GROUP_MAX_MEMBERS),
  }),
]);

export const updateConversationSchema = z
  .object({ name: groupName.optional(), muted: z.boolean().optional(), pinned: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.muted !== undefined || v.pinned !== undefined, "ცვლილება არ არის");

export const addMembersSchema = z.object({ userIds: z.array(id).min(1).max(MEMBERS_ADD_MAX) });

export const sendMessageSchema = z.object({
  /** ფაილებთან ერთად შეიძლება ცარიელი იყოს */
  body: body.default(""),
  replyToId: id.optional(),
  clientId: z.uuid().optional(),
});

export const editMessageSchema = z.object({ body });

export const markReadSchema = z.object({ messageId: id });

/** ხმა და ბრაუზერის შეტყობინებები (მომხმარებლის პარამეტრები). */
export const chatSettingsSchema = z
  .object({ soundEnabled: z.boolean().optional(), notificationsEnabled: z.boolean().optional() })
  .refine((v) => v.soundEnabled !== undefined || v.notificationsEnabled !== undefined, "ცვლილება არ არის");

/** multipart-ის ტექსტური ველები (ფაილებთან ერთად გაგზავნა). */
export const sendFormSchema = z.object({
  body: body.default(""),
  replyToId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  clientId: z.uuid().optional(),
});

/** „არ შემაწუხოთ“: dnd — ჩართვა, null — ავტომატური სტატუსი. */
export const manualStatusSchema = z.object({ manualStatus: z.enum(["dnd"]).nullable() });

/** query-სტრიქონის მთელი რიცხვი (cursor, limit). */
const intParam = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const messagePageSchema = z.object({
  before: intParam.optional(),
  after: intParam.optional(),
  around: intParam.optional(),
  limit: z.coerce.number().int().min(1).max(MESSAGE_PAGE_MAX).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH).default(""),
  before: intParam.optional(),
});
