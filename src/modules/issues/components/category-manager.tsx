"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionFailure } from "@/lib/action-result";
import { saveCategoryAction } from "@/modules/issues/actions";
import type { CategoryRow } from "@/modules/issues/types";

type Option = { value: string; label: string };

/** კატეგორიების სია და რედაქტირება (issues.manage). წაშლის ნაცვლად — გათიშვა (ძველი ბილეთები რჩება). */
export function CategoryManager({ categories, roles }: { categories: CategoryRow[]; roles: Option[] }) {
  const [editing, setEditing] = useState<CategoryRow | "new" | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" className="w-fit" onClick={() => setEditing("new")}>
        <Plus />
        ახალი კატეგორია
      </Button>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>კატეგორია</TableHead>
              <TableHead>ვის მიდის</TableHead>
              <TableHead className="text-right">ბილეთები</TableHead>
              <TableHead>სტატუსი</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id} className={c.isActive ? undefined : "text-muted-foreground"}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {c.isConfidential && <Lock className="size-3.5 text-muted-foreground" aria-label="კონფიდენციალური" />}
                    {c.name}
                  </span>
                </TableCell>
                <TableCell>{c.assigneeRole ?? <span className="text-destructive">როლი არ არის მითითებული</span>}</TableCell>
                <TableCell className="text-right tabular-nums">{c.issues}</TableCell>
                <TableCell>{c.isActive ? <Badge variant="secondary">აქტიური</Badge> : <Badge variant="outline">გათიშული</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" aria-label={`რედაქტირება: ${c.name}`} onClick={() => setEditing(c)}>
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <CategoryForm
              category={editing === "new" ? null : editing}
              roles={roles}
              nextOrder={Math.max(-1, ...categories.map((c) => c.sortOrder)) + 1}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryForm({ category, roles, nextOrder, onDone }: { category: CategoryRow | null; roles: Option[]; nextOrder: number; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [roleId, setRoleId] = useState(category?.assigneeRoleId ? String(category.assigneeRoleId) : "");
  const [isConfidential, setConfidential] = useState(category?.isConfidential ?? false);
  const [isActive, setActive] = useState(category?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? nextOrder));
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = failure?.fieldErrors ?? {};

  function submit() {
    startTransition(async () => {
      try {
        const res = await saveCategoryAction({
          id: category?.id,
          name,
          assigneeRoleId: Number(roleId) || 0,
          isConfidential,
          isActive,
          sortOrder: Number(sortOrder) || 0,
        });
        if (!res.ok) {
          setFailure(res);
          return;
        }
        toast.success(res.message);
        onDone();
        router.refresh();
      } catch {
        toast.error("შენახვა ვერ მოხერხდა. სცადეთ თავიდან");
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
        <DialogTitle>{category ? "კატეგორიის რედაქტირება" : "ახალი კატეგორია"}</DialogTitle>
        <DialogDescription>ბილეთი მიდის არჩეული როლის ყველა თანამშრომელთან; ერთ-ერთი „იღებს“ და ამუშავებს.</DialogDescription>
      </DialogHeader>
      {failure?.error && !failure.fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{failure.error}</AlertDescription>
        </Alert>
      )}
      <FormField id="category-name" label="დასახელება *" error={errors.name}>
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-invalid={errors.name ? true : undefined} autoFocus />
      </FormField>
      <FormField id="category-role" label="ვის მიდის *" error={errors.assigneeRoleId}>
        <Select items={roles} value={roleId || null} onValueChange={(v) => setRoleId((v as string | null) ?? "")}>
          <SelectTrigger id="category-role" className="h-10 w-full" aria-invalid={errors.assigneeRoleId ? true : undefined}>
            <SelectValue placeholder="აირჩიეთ როლი" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id="category-order" label="რიგი სიაში" error={errors.sortOrder}>
        <Input id="category-order" type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-28" />
      </FormField>
      <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
        <div>
          <Label htmlFor="category-confidential">კონფიდენციალური</Label>
          <p className="text-xs text-muted-foreground">ხედავს მხოლოდ ავტორი, მიმღები როლი და ადმინისტრატორი</p>
        </div>
        <Switch id="category-confidential" checked={isConfidential} onCheckedChange={setConfidential} />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
        <div>
          <Label htmlFor="category-active">აქტიური</Label>
          <p className="text-xs text-muted-foreground">გათიშული ახალ ბილეთში აღარ ჩანს</p>
        </div>
        <Switch id="category-active" checked={isActive} onCheckedChange={setActive} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : "შენახვა"}
        </Button>
      </DialogFooter>
    </form>
  );
}
