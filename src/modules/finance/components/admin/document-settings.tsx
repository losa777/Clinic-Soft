"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hash, Stamp, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { removeStampAction, saveNumberingAction, uploadStampAction } from "@/modules/finance/actions/settings-actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, onDone?: () => void) =>
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) return void toast.error(res.error);
        toast.success(res.message);
        onDone?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  return { run, pending };
}

/** კლინიკის ბეჭედი — ხელმოწერილ ფორმა 100-ზე (ხელმოწერისას „ბეჭედი“). PNG გამჭვირვალე ფონით საუკეთესოა. */
export function StampSettings({ stampVersion }: { stampVersion: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const { run, pending } = useRun();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Stamp className="size-4 text-muted-foreground" />
        <CardTitle>ბეჭედი</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-start gap-4">
        <div className="flex size-36 items-center justify-center rounded-lg border bg-white">
          {stampVersion ? (
            // eslint-disable-next-line @next/next/no-img-element -- ავტორიზებული API, ოპტიმიზაცია არ სჭირდება
            <img src={`/api/settings/stamp?v=${encodeURIComponent(stampVersion)}`} alt="კლინიკის ბეჭედი" className="max-h-32 max-w-32 object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-muted-foreground">ატვირთული არ არის</span>
          )}
        </div>
        <form
          className="flex min-w-64 flex-1 flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const file = fileRef.current?.files?.[0];
            if (!file) return;
            const data = new FormData();
            data.set("file", file);
            run(() => uploadStampAction(data), () => {
              if (fileRef.current) fileRef.current.value = "";
              setHasFile(false);
            });
          }}
        >
          <p className="text-sm text-muted-foreground">
            PNG (სასურველია გამჭვირვალე ფონით) ან JPG, მაქს. 1 MB. ხელმოწერისას ფორმა 100-ზე დაისმება (თუ „ბეჭედი“ მონიშნულია).
          </p>
          <Input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={(e) => setHasFile(Boolean(e.target.files?.length))} aria-label="ბეჭდის ფაილი" />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !hasFile}>
              <Upload />
              ატვირთვა
            </Button>
            {stampVersion && (
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(removeStampAction)}>
                <Trash2 />
                წაშლა
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** ნუმერაცია: ფორმა 100-ის ბოლო გაცემული ცნობის № და მიმდინარე წლის ბოლო სამედიცინო ბარათის №. შემდეგი — +1. */
export function NumberingSettings({ form100Last, cardLast, year }: { form100Last: number; cardLast: number; year: number }) {
  const [values, setValues] = useState({ form100Last: String(form100Last), cardLast: String(cardLast) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Hash className="size-4 text-muted-foreground" />
        <CardTitle>ნუმერაცია</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveNumberingAction({ form100Last: Number(values.form100Last), cardLast: Number(values.cardLast) });
              setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message);
              router.refresh();
            });
          }}
        >
          <FormField id="num-f100" label="ფორმა 100 — ბოლო გაცემული ცნობის №" error={errors.form100Last} hint={`შემდეგი: ${Number(values.form100Last || 0) + 1}`}>
            <Input id="num-f100" inputMode="numeric" value={values.form100Last} onChange={(e) => setValues((v) => ({ ...v, form100Last: e.target.value }))} className="h-10" />
          </FormField>
          <FormField id="num-card" label={`სამედიცინო ბარათი — ბოლო № (${year})`} error={errors.cardLast} hint={`შემდეგი: ${Number(values.cardLast || 0) + 1}/${year}`}>
            <Input id="num-card" inputMode="numeric" value={values.cardLast} onChange={(e) => setValues((v) => ({ ...v, cardLast: e.target.value }))} className="h-10" />
          </FormField>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            ძველი სისტემიდან გადმოსვლისას მიუთითეთ ბოლო გაცემული ნომრები — ნუმერაცია გაგრძელდება. ნომრის შემცირებამ შეიძლება გამოიწვიოს განმეორება.
          </p>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "ინახება..." : "შენახვა"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
