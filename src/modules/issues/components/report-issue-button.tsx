"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { startNavigationProgress } from "@/components/navigation-progress";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionFailure } from "@/lib/action-result";
import { createIssueAction, issueFormAction } from "@/modules/issues/actions";
import { FilePicker } from "@/modules/issues/components/file-picker";
import { DESCRIPTION_MAX, ISSUE_PRIORITIES, type IssuePriorityValue, LOCATION_MAX, TITLE_MAX } from "@/modules/issues/labels";
import type { IssueCategoryOption } from "@/modules/issues/types";

/** „პრობლემა“ ზედა პანელში — ყველა როლს, ნებისმიერი გვერდიდან. ფორმა იმავე გვერდზე იხსნება. */
export function ReportIssueButton() {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<IssueCategoryOption[] | null>(null);

  function show() {
    setOpen(true);
    // კატეგორიები ყოველ გახსნაზე (ადმინმა შეიძლება შეცვალა)
    issueFormAction()
      .then(setCategories)
      .catch(() => toast.error("ფორმა ვერ ჩაიტვირთა. სცადეთ თავიდან"));
  }

  return (
    <>
      <Button variant="outline" size="lg" onClick={show} aria-label="პრობლემის შეტყობინება" title="პრობლემის შეტყობინება">
        <TriangleAlert />
        <span className="hidden lg:inline">პრობლემა</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && <IssueForm categories={categories} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function IssueForm({ categories, onDone }: { categories: IssueCategoryOption[] | null; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<IssuePriorityValue>("normal");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = failure?.fieldErrors ?? {};
  const confidential = categories?.find((c) => String(c.id) === categoryId)?.isConfidential ?? false;

  function submit() {
    startTransition(async () => {
      const data = new FormData();
      data.set(
        "issue",
        JSON.stringify({
          title,
          categoryId: Number(categoryId) || 0,
          priority,
          location,
          description,
          sourcePath: `${window.location.pathname}${window.location.search}`,
        }),
      );
      for (const f of files) data.append("files", f);
      try {
        const res = await createIssueAction(data);
        if (!res.ok) {
          setFailure(res);
          return;
        }
        const href = `/issues/${res.issueId}`;
        toast.success(res.message, { action: { label: "ნახვა", onClick: () => (startNavigationProgress(), router.push(href)) }, duration: 8_000 });
        onDone();
        router.refresh();
      } catch {
        toast.error("პრობლემა ვერ დაფიქსირდა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>პრობლემის შეტყობინება</DialogTitle>
        <DialogDescription>
          ბილეთი ავტომატურად მივა პასუხისმგებელთან. სტატუსს ნახავთ{" "}
          <Link href="/issues" onClick={onDone} className="text-primary hover:underline">
            პრობლემების გვერდზე
          </Link>
          .
        </DialogDescription>
      </DialogHeader>
      {failure?.error && !failure.fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{failure.error}</AlertDescription>
        </Alert>
      )}

      <FormField id="issue-title" label="რა მოხდა? *" error={errors.title}>
        <Input
          id="issue-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="მაგ. პრინტერი არ ბეჭდავს"
          aria-invalid={errors.title ? true : undefined}
          autoFocus
        />
      </FormField>

      <FormField id="issue-category" label="კატეგორია *" error={errors.categoryId}>
        <Select
          items={(categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          value={categoryId || null}
          onValueChange={(v) => setCategoryId((v as string | null) ?? "")}
          disabled={!categories}
        >
          <SelectTrigger id="issue-category" className="h-10 w-full" aria-invalid={errors.categoryId ? true : undefined}>
            <SelectValue placeholder={categories ? "აირჩიეთ კატეგორია" : "იტვირთება..."} />
          </SelectTrigger>
          <SelectContent>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {confidential && <p className="-mt-2 text-xs text-muted-foreground">კონფიდენციალური: ნახავს მხოლოდ პასუხისმგებელი და ადმინისტრატორი.</p>}

      <FormField id="issue-priority" label="პრიორიტეტი" hint="სასწრაფო — თუ პაციენტის მიღება ან სამუშაო ჩერდება" error={errors.priority}>
        <SegmentedChoice id="issue-priority" items={ISSUE_PRIORITIES} value={priority} onChange={setPriority} />
      </FormField>

      <FormField id="issue-location" label="სად? (კაბინეტი, ოთახი)" error={errors.location}>
        <Input id="issue-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={LOCATION_MAX} placeholder="მაგ. კაბინეტი 12" />
      </FormField>

      <FormField id="issue-description" label="დეტალები" hint="დიაგნოზი და სამედიცინო ინფორმაცია აქ არ ჩაწეროთ" error={errors.description}>
        <Textarea id="issue-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={DESCRIPTION_MAX} />
      </FormField>

      <FilePicker files={files} onChange={setFiles} onError={(error) => toast.error(error)} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending || !categories}>
          {pending ? "იგზავნება..." : "გაგზავნა"}
        </Button>
      </DialogFooter>
    </form>
  );
}
