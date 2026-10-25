import Link from "next/link";
import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import { ArrowLeft, FileText, MapPin, MessageSquare, Settings2 } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatSize } from "@/modules/chat/files";
import { FilterBar, FilterField, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { param, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { ConfidentialBadge, IssuePriorityBadge, IssueStatusBadge } from "@/modules/issues/components/badges";
import { CategoryManager } from "@/modules/issues/components/category-manager";
import { CommentForm, IssueActions } from "@/modules/issues/components/issue-actions";
import { ISSUE_PRIORITIES, type IssuePriorityValue, priorityLabel } from "@/modules/issues/labels";
import { issueUser } from "@/modules/issues/server/access";
import { listCategories, roleOptions } from "@/modules/issues/server/categories";
import { activeCategories, issueTabs, ISSUES_PAGE_SIZE, listIssues, loadIssueDetail } from "@/modules/issues/server/issues";
import type { IssueAttachmentItem, IssueFilter, IssueStatusFilter, IssueTimelineItem, IssueView } from "@/modules/issues/types";

type User = Session["user"];

const BASE = "/issues";

const STATUS_FILTER_OPTIONS: { value: IssueStatusFilter; label: string }[] = [
  { value: "open", label: "ღია" },
  { value: "resolved", label: "დადასტურებას ელოდება" },
  { value: "done", label: "დასრულებული" },
  { value: "all", label: "ყველა" },
];

const VIEW_LABELS: Record<IssueView, string> = { mine: "ჩემი შეტყობინებები", assigned: "ჩემზე მიწერილი", all: "ყველა ბილეთი" };

/**
 * ბილეთების სია: ჩანართები (ჩემი / ჩემზე მიწერილი / ყველა) და ფილტრები URL-ში.
 * defaultView — IT-ის მთავარ გვერდზე „ჩემზე მიწერილი“; base — სიის მისამართი (ადმინის/დირექტორის განყოფილებაშიც ჩანს).
 */
export async function IssuesScreen({
  user,
  searchParams,
  defaultView = "mine",
  base = BASE,
}: {
  user: User;
  searchParams: SearchParams;
  defaultView?: IssueView;
  base?: string;
}) {
  const u = await issueUser(user);
  const tabs = await issueTabs(u);
  const allowed = (v: string): v is IssueView => v === "mine" || (v === "assigned" && tabs.assigned !== null) || (v === "all" && tabs.all !== null);
  const requested = param(searchParams.view);
  const view: IssueView = allowed(requested) ? requested : allowed(defaultView) ? defaultView : "mine";
  const statusParam = param(searchParams.status) as IssueStatusFilter;
  const priorityParam = param(searchParams.priority) as IssuePriorityValue;
  const filter: IssueFilter = {
    view,
    status: STATUS_FILTER_OPTIONS.some((o) => o.value === statusParam) ? statusParam : "open",
    categoryId: positiveInt(searchParams.category),
    priority: ISSUE_PRIORITIES.some((p) => p.value === priorityParam) ? priorityParam : null,
    page: positiveInt(searchParams.page) ?? 1,
  };
  const [{ rows, total }, categories] = await Promise.all([listIssues(u, filter), activeCategories()]);
  const query = { view, status: filter.status, category: filter.categoryId, priority: filter.priority };

  const tabItems = (
    [
      ["mine", tabs.mine],
      ["assigned", tabs.assigned],
      ["all", tabs.all],
    ] as const
  ).filter(([, count]) => count !== null);

  return (
    <section className="flex flex-col gap-4">
      <LiveRefresh topics={["issues"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">პრობლემები</h1>
        {u.isManager && (
          <Link href={`${BASE}/categories`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Settings2 />
            კატეგორიები
          </Link>
        )}
      </div>

      <nav className="tab-scroll -mx-4 border-b px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1">
          {tabItems.map(([v, count]) => (
            <li key={v}>
              <Link
                href={withParams(base, { view: v })}
                aria-current={v === view ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  v === view ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {VIEW_LABELS[v]}
                {count ? <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{count}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <FilterBar action={base}>
        <input type="hidden" name="view" value={view} />
        <FilterField label="სტატუსი">
          <NativeSelect name="status" value={filter.status} options={STATUS_FILTER_OPTIONS} />
        </FilterField>
        <FilterField label="კატეგორია">
          <NativeSelect
            name="category"
            value={filter.categoryId ? String(filter.categoryId) : ""}
            options={[{ value: "", label: "ყველა" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
            className="max-w-56"
          />
        </FilterField>
        <FilterField label="პრიორიტეტი">
          <NativeSelect name="priority" value={filter.priority ?? ""} options={[{ value: "", label: "ყველა" }, ...ISSUE_PRIORITIES]} />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {view === "mine" ? "ბილეთი არ არის. პრობლემის შესატყობინებლად დააჭირეთ „პრობლემა“-ს ზედა პანელში." : "ბილეთი არ არის"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`${BASE}/${r.id}`}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 sm:p-4",
                  r.priority === "urgent" && (r.status === "new" || r.status === "in_progress" || r.status === "waiting") && "border-destructive/50",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{r.number}</span>
                  <IssueStatusBadge status={r.status} />
                  <IssuePriorityBadge priority={r.priority} />
                  {r.confidential && <ConfidentialBadge />}
                </div>
                <p className="font-medium">{r.title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{r.category}</span>
                  <span>
                    {r.createdBy} · {r.createdAt}
                  </span>
                  <span>შემსრულებელი: {r.assignee ?? (r.assigneeRole ? `${r.assigneeRole} (ჯერ არავინ აიღო)` : "—")}</span>
                  {r.comments > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="size-3" />
                      {r.comments}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={filter.page} pageCount={Math.ceil(total / ISSUES_PAGE_SIZE)} href={(page) => withParams(base, { ...query, page })} />
    </section>
  );
}

const EVENT_TEXT: Record<string, (from: string | null, to: string | null) => string> = {
  status: (from, to) => `სტატუსი: ${from ?? "—"} → ${to ?? "—"}`,
  assigned: (from, to) => (to ? `შემსრულებელი: ${to}${from ? ` (იყო ${from})` : ""}` : `შემსრულებელი მოიხსნა${from ? ` (იყო ${from})` : ""}`),
  category: (from, to) => `კატეგორია: ${from ?? "—"} → ${to ?? "—"}`,
  priority: (from, to) => `პრიორიტეტი: ${from ?? "—"} → ${to ?? "—"}`,
};

const fileUrl = (id: number) => `/api/issues/attachments/${id}`;

function Attachments({ items }: { items: IssueAttachmentItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((a) => (
        <li key={a.id}>
          <a href={fileUrl(a.id)} target="_blank" rel="noopener" className="block rounded-lg border hover:bg-muted/50" title={a.fileName}>
            {a.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- დაცული ფაილი (სესიით), next/image-ის ოპტიმიზაცია არ ერგება
              <img src={fileUrl(a.id)} alt={a.fileName} className="size-24 rounded-lg object-cover" loading="lazy" />
            ) : (
              <span className="flex max-w-56 items-center gap-2 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(a.size)}</span>
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

function TimelineEntry({ item }: { item: IssueTimelineItem }) {
  if (item.kind === "event") {
    return (
      <li className="px-1 text-xs text-muted-foreground">
        <span className="tabular-nums">{item.at}</span> · {item.user ?? "სისტემა"} — {EVENT_TEXT[item.event]?.(item.from, item.to) ?? item.event}
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{item.user ?? "—"}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{item.at}</span>
      </div>
      {item.body && <p className="text-sm whitespace-pre-wrap">{item.body}</p>}
      <Attachments items={item.attachments} />
    </li>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export async function IssueScreen({ user, rawId }: { user: User; rawId: string }) {
  const id = Number(rawId);
  const u = await issueUser(user);
  const issue = Number.isSafeInteger(id) && id > 0 ? await loadIssueDetail(id, u) : null;
  if (!issue) notFound();

  return (
    <section className="flex flex-col gap-4">
      <LiveRefresh topics={["issues"]} />
      <Link href={BASE} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        პრობლემები
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">{issue.number}</span>
          <IssueStatusBadge status={issue.status} />
          <IssuePriorityBadge priority={issue.priority} />
          {issue.category.isConfidential && <ConfidentialBadge />}
        </div>
        <h1 className="text-2xl font-semibold">{issue.title}</h1>
      </div>

      <IssueActions issueId={issue.id} actions={issue.actions} route={issue.route} current={{ categoryId: issue.category.id, priority: issue.priority, assigneeId: issue.assignee?.id ?? null }} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="კატეგორია">{issue.category.name}</Info>
            <Info label="პრიორიტეტი">{priorityLabel(issue.priority)}</Info>
            <Info label="შემსრულებელი">{issue.assignee?.name ?? (issue.assigneeRole ? `${issue.assigneeRole} — ჯერ არავინ აიღო` : "—")}</Info>
            <Info label="ავტორი">
              {issue.createdBy.name}
              {issue.createdBy.role && <span className="text-muted-foreground"> · {issue.createdBy.role}</span>}
            </Info>
            <Info label="შეიქმნა">{issue.createdAt}</Info>
            {issue.location && (
              <Info label="ადგილი">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  {issue.location}
                </span>
              </Info>
            )}
          </dl>
          {issue.description && <p className="text-sm whitespace-pre-wrap">{issue.description}</p>}
          <Attachments items={issue.attachments} />
          {issue.sourcePath && (
            <p className="text-xs text-muted-foreground">
              გვერდი, საიდანაც შეიქმნა:{" "}
              <Link href={issue.sourcePath} className="break-all text-primary hover:underline">
                {issue.sourcePath}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {issue.resolution && (
        <div className={cn("rounded-xl border p-3 text-sm", issue.status === "rejected" ? "bg-muted/50" : "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20")}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{issue.status === "rejected" ? "უარის მიზეზი" : "რა გაკეთდა"}</p>
          <p className="whitespace-pre-wrap">{issue.resolution}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">ისტორია და კომენტარები</h2>
        {issue.timeline.length ? (
          <ul className="flex flex-col gap-2">
            {issue.timeline.map((item) => (
              <TimelineEntry key={item.key} item={item} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ჯერ არაფერია.</p>
        )}
        <CommentForm issueId={issue.id} />
      </div>
    </section>
  );
}

/** კატეგორიები და მიმღები როლები (issues.manage — გვერდზე requirePermission). */
export async function IssueCategoriesScreen() {
  const [categories, roles] = await Promise.all([listCategories(), roleOptions()]);
  return (
    <section className="flex flex-col gap-4">
      <Link href={BASE} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        პრობლემები
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">პრობლემების კატეგორიები</h1>
        <p className="text-sm text-muted-foreground">კატეგორია განსაზღვრავს, ვის მიდის ბილეთი. ცვლილება ახალ ბილეთებზე მოქმედებს.</p>
      </div>
      <CategoryManager categories={categories} roles={roles} />
    </section>
  );
}
