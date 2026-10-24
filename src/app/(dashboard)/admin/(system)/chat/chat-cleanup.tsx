"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, MessagesSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { purgeAllAction, saveRetentionAction } from "./actions";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** ბაზაში შენახული მიმოწერის მოცულობა და მთლიანი გასუფთავება (დადასტურებით). */
export function ChatHistoryCleanup({
  messages,
  files,
  size,
  oldestAt,
}: {
  messages: number;
  files: number;
  size: string;
  oldestAt: string | null;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const purge = () =>
    startTransition(async () => {
      try {
        const res = await purgeAllAction();
        if (!res.ok) return void toast.error(res.error);
        toast.success(res.message);
        setConfirm(false);
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <MessagesSquare className="size-4 text-muted-foreground" />
        <CardTitle>შენახული მიმოწერა</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="შეტყობინება" value={messages.toLocaleString("ka-GE")} />
          <Stat label="ფაილი" value={files.toLocaleString("ka-GE")} />
          <Stat label="ფაილების ზომა" value={size} />
        </div>
        <p className="text-sm text-muted-foreground">
          {oldestAt ? `ყველაზე ძველი შეტყობინება: ${oldestAt}` : "ჩატში შეტყობინებები არ არის"}
        </p>
        <div>
          <Button variant="destructive" disabled={pending || messages === 0} onClick={() => setConfirm(true)}>
            <Trash2 />
            მთლიანი მიმოწერის წაშლა
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={(open) => !pending && setConfirm(open)}
        title="წაიშალოს მთლიანი მიმოწერა?"
        description={
          <>
            ყველა თანამშრომლის ყველა შეტყობინება ({messages.toLocaleString("ka-GE")}) და მიმაგრებული ფაილი ({files.toLocaleString("ka-GE")})
            სამუდამოდ წაიშლება. აღდგენა შეუძლებელია. საუბრები და ჯგუფები დარჩება.
          </>
        }
        confirmLabel="ყველაფრის წაშლა"
        pending={pending}
        onConfirm={purge}
      />
    </Card>
  );
}

/** ავტომატური გასუფთავება: ჩართვა/გამორთვა და რამდენი დღის ისტორია ინახება. */
export function ChatRetentionSettings({
  enabled: initialEnabled,
  days: initialDays,
  lastRunAt,
  lastDeleted,
}: {
  enabled: boolean;
  days: number;
  lastRunAt: string | null;
  lastDeleted: number | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [days, setDays] = useState(String(initialDays));
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = enabled !== initialEnabled || days !== String(initialDays);

  const save = () =>
    startTransition(async () => {
      try {
        const res = await saveRetentionAction({ enabled, days: Number(days) });
        setError(res.ok ? undefined : res.fieldErrors?.days);
        setConfirm(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(res.message);
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <CardTitle>ავტომატური გასუფთავება</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            // ჩართვისას ძველი შეტყობინებები მაშინვე იშლება — დადასტურებით
            if (enabled) setConfirm(true);
            else save();
          }}
        >
          <div className="flex items-center gap-3">
            <Switch id="retention-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={pending} />
            <Label htmlFor="retention-enabled">{enabled ? "ჩართულია" : "გამორთულია"}</Label>
          </div>
          <FormField
            id="retention-days"
            label="ინახება ბოლო (დღე)"
            error={error}
            hint="ამაზე ძველი შეტყობინებები და ფაილები დღეში ერთხელ ავტომატურად წაიშლება"
          >
            <Input
              id="retention-days"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
              disabled={!enabled || pending}
              aria-invalid={Boolean(error)}
              className="h-10 max-w-40"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            {lastRunAt
              ? `ბოლო გასუფთავება: ${lastRunAt}${lastDeleted !== null ? ` — წაიშალა ${lastDeleted} შეტყობინება` : ""}`
              : "ავტომატური გასუფთავება ჯერ არ შესრულებულა"}
          </p>
          <div>
            <Button type="submit" disabled={pending || !changed}>
              {pending ? "ინახება..." : "შენახვა"}
            </Button>
          </div>
        </form>
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={(open) => !pending && setConfirm(open)}
        title="ჩაირთოს ავტომატური გასუფთავება?"
        description={`${days} დღეზე ძველი შეტყობინებები და ფაილები ახლავე წაიშლება, შემდეგ კი — დღეში ერთხელ. აღდგენა შეუძლებელია.`}
        confirmLabel="შენახვა და გასუფთავება"
        pending={pending}
        onConfirm={save}
      />
    </Card>
  );
}
