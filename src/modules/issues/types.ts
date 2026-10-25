import type { IssuePriorityValue, IssueStatusValue } from "./labels.ts";
import type { IssueAction } from "./rules.ts";

/** სია: ჩემი (შევქმენი), ჩემზე მიწერილი, ყველა (issues.view_all / issues.manage). */
export type IssueView = "mine" | "assigned" | "all";
/** open — ახალი/მუშავდება/ელოდება, resolved — დადასტურებას ელოდება, done — დახურული/უარყოფილი. */
export type IssueStatusFilter = "open" | "resolved" | "done" | "all";

export type IssueFilter = {
  view: IssueView;
  status: IssueStatusFilter;
  categoryId: number | null;
  priority: IssuePriorityValue | null;
  page: number;
};

export type IssueCategoryOption = { id: number; name: string; isConfidential: boolean };

export type IssueListRow = {
  id: number;
  number: string;
  title: string;
  status: IssueStatusValue;
  priority: IssuePriorityValue;
  category: string;
  confidential: boolean;
  createdBy: string;
  createdAt: string;
  assignee: string | null;
  assigneeRole: string | null;
  comments: number;
};

export type IssueTabs = { mine: number; assigned: number | null; all: number | null };

export type IssueAttachmentItem = { id: number; fileName: string; mimeType: string; size: number; image: boolean };

export type IssueTimelineItem =
  | { kind: "comment"; key: string; at: string; user: string | null; body: string; attachments: IssueAttachmentItem[] }
  | { kind: "event"; key: string; at: string; user: string | null; event: string; from: string | null; to: string | null };

export type IssueDetail = {
  id: number;
  number: string;
  title: string;
  description: string | null;
  status: IssueStatusValue;
  priority: IssuePriorityValue;
  category: IssueCategoryOption;
  location: string | null;
  sourcePath: string | null;
  createdBy: { name: string; role: string | null };
  createdAt: string;
  assignee: { id: number; name: string } | null;
  assigneeRole: string | null;
  resolution: string | null;
  attachments: IssueAttachmentItem[];
  timeline: IssueTimelineItem[];
  actions: IssueAction[];
  /** გადაცემის ფორმის მონაცემები — მხოლოდ შემსრულებელს */
  route: { categories: IssueCategoryOption[]; users: { id: number; name: string }[] } | null;
};

export type CategoryRow = {
  id: number;
  name: string;
  assigneeRoleId: number | null;
  assigneeRole: string | null;
  isConfidential: boolean;
  isActive: boolean;
  sortOrder: number;
  issues: number;
};
