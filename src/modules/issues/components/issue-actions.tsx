"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { commentIssueAction, issueActionAction, routeIssueAction } from "@/modules/issues/actions";
import { FilePicker } from "@/modules/issues/components/file-picker";
import { COMMENT_MAX, ISSUE_PRIORITIES, type IssuePriorityValue, RESOLUTION_MAX } from "@/modules/issues/labels";
import { ISSUE_ACTIONS, type IssueAction } from "@/modules/issues/rules";
import type { IssueDetail } from "@/modules/issues/types";

/** მოქმედების გაშვება: შეცდომა ფორმაში, წარმატება — toast და გვერდის განახლება. */
function useRun(onDone?: () => void) {
  const router = useRouter();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setFailure(res);
          if (!onDone) toast.error(res.error ?? "მოქმედება ვერ შესრულდა");
          return;
        }
        setFailure(null);
        toast.success(res.message);
        onDone?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  return { run, pending, errors: failure?.fieldErrors ?? {}, formError: failure && !failure.fieldErrors ? failure.error : undefined };
}

const PRIMARY: IssueAction[] = ["take", "resolve", "confirm"];
const DANGER: IssueAction[] = ["reject"];

const TEXT_LABELS: Partial<Record<IssueAction, string>> = {
  wait: "რას ელოდება? (ნაწილს, ტექნიკოსს, ინფორმაციას...)",
  resolve: "რა გაკეთდა?",
  reject: "უარის მიზეზი (დუბლიკატი, პრობლემა არ არის...)",
  reopen: "რა არ მოგვარდა?",
  withdraw: "კომენტარი (არასავალდებულო)",
};

export function IssueActions({
  issueId,
  actions,
  route,
  current,
}: {
  issueId: number;
  actions: IssueAction[];
  route: IssueDetail["route"];
  current: { categoryId: number; priority: IssuePriorityValue; assigneeId: number | null };
}) {
  const [dialog, setDialog] = useState<IssueAction | "route" | null>(null);
  const { run, pending } = useRun();
  if (!actions.length && !route) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button
          key={a}
          size="lg"
          variant={PRIMARY.includes(a) ? "default" : DANGER.includes(a) ? "destructive" : "outline"}
          disabled={pending}
          onClick={() => (ISSUE_ACTIONS[a].text === "none" ? run(() => issueActionAction({ issueId, action: a, text: "" })) : setDialog(a))}
        >
          {ISSUE_ACTIONS[a].label}
        </Button>
      ))}
      {route && (
        <Button size="lg" variant="outline" onClick={() => setDialog("route")}>
          <ArrowRightLeft />
          გადაცემა
        </Button>
      )}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog === "route" ? (
            route && <RouteForm issueId={issueId} route={route} current={current} onDone={() => setDialog(null)} />
          ) : dialog ? (
            <TextActionForm issueId={issueId} action={dialog} onDone={() => setDialog(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormError({ error }: { error?: string }) {
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}

function TextActionForm({ issueId, action, onDone }: { issueId: number; action: IssueAction; onDone: () => void }) {
  const [text, setText] = useState("");
  const { run, pending, errors, formError } = useRun(onDone);
  const required = ISSUE_ACTIONS[action].text === "required";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => issueActionAction({ issueId, action, text }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{ISSUE_ACTIONS[action].label}</DialogTitle>
        <DialogDescription>ტექსტი ბილეთის ისტორიაში ჩაიწერება და ავტორი/შემსრულებელი შეტყობინებას მიიღებს.</DialogDescription>
      </DialogHeader>
      <FormError error={formError} />
      <FormField id="issue-action-text" label={`${TEXT_LABELS[action] ?? "კომენტარი"}${required ? " *" : ""}`} error={errors.text}>
        <Textarea id="issue-action-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={RESOLUTION_MAX} autoFocus />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" variant={DANGER.includes(action) ? "destructive" : "default"} disabled={pending}>
          {pending ? "მიმდინარეობს..." : ISSUE_ACTIONS[action].label}
        </Button>
      </DialogFooter>
    </form>
  );
}

const NO_ASSIGNEE = "none";

function RouteForm({
  issueId,
  route,
  current,
  onDone,
}: {
  issueId: number;
  route: NonNullable<IssueDetail["route"]>;
  current: { categoryId: number; priority: IssuePriorityValue; assigneeId: number | null };
  onDone: () => void;
}) {
  const [categoryId, setCategoryId] = useState(String(current.categoryId));
  const [priority, setPriority] = useState<IssuePriorityValue>(current.priority);
  const [assigneeId, setAssigneeId] = useState(current.assigneeId ? String(current.assigneeId) : NO_ASSIGNEE);
  const { run, pending, errors, formError } = useRun(onDone);
  const categories = route.categories.map((c) => ({ value: String(c.id), label: c.name }));
  // გათიშული კატეგორია სიაში აღარ არის — ბილეთზე მაინც რჩება, სანამ არ შეიცვლება
  if (!categories.some((c) => c.value === String(current.categoryId))) categories.unshift({ value: String(current.categoryId), label: "მიმდინარე (გათიშული)" });
  const users = [{ value: NO_ASSIGNEE, label: "— კატეგორიის როლი (ვინც აიღებს)" }, ...route.users.map((x) => ({ value: String(x.id), label: x.name }))];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => routeIssueAction({ issueId, categoryId: Number(categoryId), priority, assigneeId: assigneeId === NO_ASSIGNEE ? null : Number(assigneeId) }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>ბილეთის გადაცემა</DialogTitle>
        <DialogDescription>კატეგორიის შეცვლით ბილეთი სხვა როლს გადაეცემა; შეგიძლიათ კონკრეტული ადამიანიც აირჩიოთ.</DialogDescription>
      </DialogHeader>
      <FormError error={formError} />
      <FormField id="route-category" label="კატეგორია" error={errors.categoryId}>
        <Select items={categories} value={categoryId} onValueChange={(v) => setCategoryId((v as string | null) ?? categoryId)}>
          <SelectTrigger id="route-category" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id="route-priority" label="პრიორიტეტი" error={errors.priority}>
        <SegmentedChoice id="route-priority" items={ISSUE_PRIORITIES} value={priority} onChange={setPriority} />
      </FormField>
      <FormField id="route-assignee" label="შემსრულებელი" error={errors.assigneeId}>
        <Select items={users} value={assigneeId} onValueChange={(v) => setAssigneeId((v as string | null) ?? NO_ASSIGNEE)}>
          <SelectTrigger id="route-assignee" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {users.map((x) => (
              <SelectItem key={x.value} value={x.value}>
                {x.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          უკან
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : "შენახვა"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CommentForm({ issueId }: { issueId: number }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const { run, pending, errors, formError } = useRun(() => {
    setBody("");
    setFiles([]);
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData();
        data.set("comment", JSON.stringify({ issueId, body }));
        for (const f of files) data.append("files", f);
        run(() => commentIssueAction(data));
      }}
      className="flex flex-col gap-2"
      noValidate
    >
      <FormError error={formError} />
      <FormField id="issue-comment" label="კომენტარი" error={errors.body}>
        <Textarea id="issue-comment" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={COMMENT_MAX} placeholder="დაწერეთ კომენტარი ან კითხვა" />
      </FormField>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilePicker files={files} onChange={setFiles} onError={(error) => toast.error(error)} />
        <Button type="submit" size="lg" disabled={pending || (!body.trim() && !files.length)}>
          <Send />
          {pending ? "იგზავნება..." : "გაგზავნა"}
        </Button>
      </div>
    </form>
  );
}
