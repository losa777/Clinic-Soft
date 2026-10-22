"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { formatGel } from "@/lib/money";
import { cn } from "@/lib/utils";
import { closeShiftAction, openShiftAction } from "@/modules/finance/actions/cash-actions";
import { fromTetri, shiftDifference, toTetri } from "@/modules/finance/calc";
import type { ShiftSummary } from "@/modules/finance/types";
import { Money } from "./invoice-status-badge";

function useAction(onSuccess?: () => void) {
  const router = useRouter();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setFailure(res);
          if (!res.fieldErrors) toast.error(res.error);
          return;
        }
        setFailure(null);
        toast.success(res.message);
        onSuccess?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }
  return { run, pending, errors: failure?.fieldErrors ?? {} };
}

/** სალაროს ცვლა: გახსნა საწყისი ნაღდით; ღია ცვლის ოპერაციები; დახურვა ფაქტობრივი ნაღდით და სხვაობით. */
export function CashShiftPanel({ shift, recent }: { shift: ShiftSummary | null; recent: ShiftSummary[] }) {
  return (
    <div className="flex flex-col gap-4">
      {shift ? <OpenShift shift={shift} /> : <OpenForm />}
      <Card>
        <CardHeader>
          <CardTitle>ბოლო დახურული ცვლები</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">დახურული ცვლა ჯერ არ არის.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>გახსნა</TableHead>
                  <TableHead>დახურვა</TableHead>
                  <TableHead className="text-right">საწყისი</TableHead>
                  <TableHead className="text-right">ნაღდი შემოსავალი</TableHead>
                  <TableHead className="text-right">ბარათი</TableHead>
                  <TableHead className="text-right">მოსალოდნელი</TableHead>
                  <TableHead className="text-right">ფაქტობრივი</TableHead>
                  <TableHead className="text-right">სხვაობა</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">{s.openedAt}</TableCell>
                    <TableCell className="tabular-nums">{s.closedAt}</TableCell>
                    <TableCell className="text-right"><Money value={s.openingCash} /></TableCell>
                    <TableCell className="text-right">
                      <Money value={fromTetri(toTetri(s.cashPayments) - toTetri(s.cashRefunds))} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={fromTetri(toTetri(s.cardPayments) - toTetri(s.cardRefunds))} />
                    </TableCell>
                    <TableCell className="text-right"><Money value={s.expectedCash} /></TableCell>
                    <TableCell className="text-right"><Money value={s.actualCash ?? "0"} /></TableCell>
                    <TableCell className="text-right" title={s.closeNote ?? undefined}>
                      <Difference value={s.difference ?? "0"} />
                      {s.closeNote && <p className="max-w-48 truncate text-xs text-muted-foreground">{s.closeNote}</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Difference({ value }: { value: string }) {
  const n = Number(value);
  return (
    <span className={cn("font-medium tabular-nums", n < 0 && "text-destructive", n > 0 && "text-amber-700 dark:text-amber-300")}>
      {n > 0 && "+"}
      {formatGel(value)}
    </span>
  );
}

function OpenForm() {
  const [openingCash, setOpeningCash] = useState("0");
  const { run, pending, errors } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-5 text-muted-foreground" />
          ცვლა დახურულია
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => openShiftAction({ openingCash }));
          }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          noValidate
        >
          <FormField id="shift-opening" label="სალაროში არსებული ნაღდი (₾)" error={errors.openingCash} hint="ნაღდი გადახდა მხოლოდ ღია ცვლით მიიღება">
            <Input
              id="shift-opening"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              inputMode="decimal"
              className="h-10 w-48 tabular-nums"
              autoFocus
            />
          </FormField>
          <Button type="submit" size="lg" disabled={pending} className="sm:mb-5">
            <LockOpen />
            {pending ? "იხსნება..." : "ცვლის გახსნა"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function OpenShift({ shift }: { shift: ShiftSummary }) {
  const [actualCash, setActualCash] = useState("");
  const [note, setNote] = useState("");
  const { run, pending, errors } = useAction(() => {
    setActualCash("");
    setNote("");
  });

  let difference: number | null = null;
  try {
    if (actualCash.trim()) difference = shiftDifference(toTetri(actualCash), toTetri(shift.expectedCash));
  } catch {
    difference = null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockOpen className="size-5 text-emerald-600" />
            ცვლა ღიაა — {shift.openedAt}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Row label="საწყისი ნაღდი" value={shift.openingCash} />
            <Row label="ოპერაციები" text={String(shift.operations)} />
            <Row label="ნაღდი გადახდები" value={shift.cashPayments} />
            <Row label="ნაღდი დაბრუნებები" value={shift.cashRefunds} negative />
            <Row label="ბარათით გადახდები" value={shift.cardPayments} />
            <Row label="ბარათით დაბრუნებები" value={shift.cardRefunds} negative />
          </dl>
          <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2">
            სალაროში უნდა იყოს: <b className="text-xl tabular-nums">{formatGel(shift.expectedCash)}</b>
            <span className="block text-xs text-muted-foreground">საწყისი + ნაღდი გადახდები − ნაღდი დაბრუნებები</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ცვლის დახურვა</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => closeShiftAction({ shiftId: shift.id, actualCash, note }));
            }}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormField id="shift-actual" label="დათვლილი ნაღდი (₾) *" error={errors.actualCash}>
              <Input
                id="shift-actual"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                inputMode="decimal"
                className="h-10 w-48 tabular-nums"
              />
            </FormField>
            {difference !== null && (
              <Alert variant={difference === 0 ? "default" : "destructive"}>
                <AlertDescription>
                  {difference === 0 ? (
                    "სხვაობა არ არის"
                  ) : (
                    <>
                      {difference < 0 ? "დანაკლისი" : "ზედმეტი"}: <Difference value={fromTetri(difference)} /> — მიუთითეთ განმარტება
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <FormField id="shift-note" label="განმარტება" error={errors.note} hint="სავალდებულოა სხვაობის შემთხვევაში">
              <Textarea id="shift-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
            </FormField>
            <Button type="submit" size="lg" variant="destructive" disabled={pending} className="self-start">
              <Lock />
              {pending ? "იხურება..." : "ცვლის დახურვა"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, text, negative }: { label: string; value?: string; text?: string; negative?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">
        {text ?? (
          <>
            {negative && Number(value) > 0 && "−"}
            {formatGel(value ?? "0")}
          </>
        )}
      </dd>
    </div>
  );
}
