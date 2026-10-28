"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { type BankInput, deleteBankAction, saveBankAction } from "@/modules/finance/actions/bank-actions";
import type { BankRow } from "@/modules/finance/types";

/**
 * ბანკები ბარათით გადახდისთვის: დამატება, გადარქმევა, რიგი, ჩართვა/გათიშვა. გამოყენებული ბანკი არ იშლება —
 * ითიშება (ძველი გადახდები მას ინახავს); გათიშული გადახდის ფორმაში აღარ ჩანს.
 */
export function BanksManager({ banks }: { banks: BankRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          if (!res.fieldErrors) toast.error(res.error);
          return;
        }
        setErrors({});
        toast.success(res.message);
        onSuccess?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  const save = (b: BankRow, patch: Partial<BankInput>) =>
    run(() => saveBankAction({ id: b.id, name: b.name, isActive: b.isActive, sortOrder: b.sortOrder, ...patch }), () => setEditing(null));

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => saveBankAction({ name, isActive: true, sortOrder: Math.max(-1, ...banks.map((b) => b.sortOrder)) + 1 }),
            () => setName(""),
          );
        }}
        noValidate
      >
        <div className="w-full sm:w-80">
          <FormField id="bank-name" label="ახალი ბანკი" error={editing ? undefined : errors.name}>
            <Input id="bank-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="მაგ. ლიბერთი ბანკი" maxLength={100} className="h-10" />
          </FormField>
        </div>
        <Button type="submit" size="lg" disabled={pending || !name.trim()} className={!editing && errors.name ? "mb-5" : undefined}>
          <Plus />
          დამატება
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ბანკი</TableHead>
              <TableHead className="text-right">გადახდები</TableHead>
              <TableHead>სტატუსი</TableHead>
              <TableHead className="w-28 text-right">მოქმედება</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banks.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                  ბანკი ჯერ არ არის დამატებული — ბარათით გადახდისას ბანკის არჩევა არ მოითხოვება
                </TableCell>
              </TableRow>
            )}
            {banks.map((b) => (
              <TableRow key={b.id} className={b.isActive ? undefined : "text-muted-foreground"}>
                <TableCell className="font-medium">
                  {editing?.id === b.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(b, { name: editing.name });
                      }}
                    >
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        maxLength={100}
                        className="h-8"
                        aria-invalid={errors.name ? true : undefined}
                        autoFocus
                      />
                      <Button type="submit" size="sm" disabled={pending}>
                        შენახვა
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => (setEditing(null), setErrors({}))}>
                        გაუქმება
                      </Button>
                    </form>
                  ) : (
                    b.name
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.payments}</TableCell>
                <TableCell>
                  <label className="flex items-center gap-2">
                    <Switch checked={b.isActive} onCheckedChange={(v) => save(b, { isActive: v })} disabled={pending} aria-label={`${b.name}: აქტიური`} />
                    {b.isActive ? <Badge variant="secondary">აქტიური</Badge> : <Badge variant="outline">გათიშული</Badge>}
                  </label>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label={`გადარქმევა: ${b.name}`} onClick={() => (setEditing({ id: b.id, name: b.name }), setErrors({}))}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={`წაშლა: ${b.name}`}
                    title={b.payments ? "ბანკით უკვე გადახდებია — წაშლის ნაცვლად გათიშეთ" : "წაშლა"}
                    disabled={pending || b.payments > 0}
                    onClick={() => {
                      if (window.confirm(`წაიშალოს „${b.name}“?`)) run(() => deleteBankAction(b.id));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
