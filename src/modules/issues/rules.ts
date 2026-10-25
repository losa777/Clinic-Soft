import type { IssueStatusValue } from "./labels.ts";

/**
 * ბილეთის მოქმედებები: ვის შეუძლია (შემსრულებელი / ავტორი), რომელი სტატუსიდან და რა ხდება.
 * შემსრულებელი — მიწერილი ადამიანი, კატეგორიის როლის წევრი ან issues.manage. სუფთა მოდული (სერვერი, ბრაუზერი, ტესტები).
 */
export const ISSUE_ACTIONS = {
  /** ავიღე: შემსრულებელი ხდება ეს მომხმარებელი */
  take: { label: "ავიღე", by: "worker", from: ["new", "waiting", "in_progress"], to: "in_progress", text: "none" },
  wait: { label: "ელოდება", by: "worker", from: ["in_progress"], to: "waiting", text: "required" },
  resolve: { label: "გადაწყდა", by: "worker", from: ["new", "in_progress", "waiting"], to: "resolved", text: "required" },
  reject: { label: "უარყოფა", by: "worker", from: ["new", "in_progress", "waiting"], to: "rejected", text: "required" },
  /** ავტორი ადასტურებს, რომ მოგვარდა */
  confirm: { label: "დადასტურება — მოგვარდა", by: "creator", from: ["resolved"], to: "closed", text: "none" },
  reopen: { label: "არ მოგვარდა", by: "creator", from: ["resolved"], to: "in_progress", text: "required" },
  /** ავტორი იხსნის: აღარ არის აქტუალური */
  withdraw: { label: "აღარ არის აქტუალური", by: "creator", from: ["new", "in_progress", "waiting"], to: "closed", text: "optional" },
} as const satisfies Record<
  string,
  { label: string; by: "worker" | "creator"; from: readonly IssueStatusValue[]; to: IssueStatusValue; text: "none" | "optional" | "required" }
>;

export type IssueAction = keyof typeof ISSUE_ACTIONS;

export const ISSUE_ACTION_CODES = Object.keys(ISSUE_ACTIONS) as IssueAction[];

/** მომხმარებლის მიმართება ბილეთთან. manager (issues.manage) — ავტორის მოქმედებებიც შეუძლია (დადასტურება, დახურვა). */
export type IssueActor = { userId: number; isCreator: boolean; isWorker: boolean; isManager: boolean };

export function canDo(action: IssueAction, status: IssueStatusValue, actor: IssueActor, assigneeId: number | null): boolean {
  const a = ISSUE_ACTIONS[action];
  if (!(a.from as readonly IssueStatusValue[]).includes(status)) return false;
  // უკვე ჩემზეა და მუშავდება — „ავიღე“ ზედმეტია
  if (action === "take" && status === "in_progress" && assigneeId === actor.userId) return false;
  return a.by === "worker" ? actor.isWorker : actor.isCreator || actor.isManager;
}

export function availableActions(status: IssueStatusValue, actor: IssueActor, assigneeId: number | null): IssueAction[] {
  return ISSUE_ACTION_CODES.filter((a) => canDo(a, status, actor, assigneeId));
}

/** კატეგორიის / პრიორიტეტის / შემსრულებლის შეცვლა — შემსრულებელს, სანამ ბილეთი დასრულებული არ არის. */
export function canRoute(status: IssueStatusValue, actor: IssueActor): boolean {
  return actor.isWorker && status !== "closed" && status !== "rejected";
}
