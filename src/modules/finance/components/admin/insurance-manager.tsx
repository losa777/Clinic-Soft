"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatGel } from "@/lib/money";
import { deleteContractAction, saveCompanyAction, saveContractAction } from "@/modules/finance/actions/insurance-actions";
import type { CompanyAdminRow } from "@/modules/finance/server/insurance";
import { NativeSelectClient } from "../native-select";

type Contract = CompanyAdminRow["contracts"][number];
type Editing =
  | { kind: "company"; company: CompanyAdminRow | null }
  | { kind: "contract"; companyId: number; contract: Contract | null }
  | null;

/** სადაზღვევო კომპანიები და მათი პირობები (დაფარვის % და ლიმიტი სერვისზე ან კატეგორიაზე). */
export function InsuranceManager({
  companies,
  services,
  categories,
}: {
  companies: CompanyAdminRow[];
  services: { id: number; label: string }[];
  categories: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Contract | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteContractAction(deleting.id);
      if (res.ok) {
        toast.success(res.message);
        setDeleting(null);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="lg" onClick={() => setEditing({ kind: "company", company: null })}>
          <Plus />
          ახალი კომპანია
        </Button>
      </div>
      {companies.length === 0 && <p className="text-sm text-muted-foreground">სადაზღვევო კომპანია ჯერ არ არის დამატებული.</p>}
      {companies.map((c) => (
        <Card key={c.id} className={c.isActive ? undefined : "opacity-70"}>
          <CardHeader className="flex flex-row flex-wrap items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              {c.name}
              {!c.isActive && <Badge variant="outline">გათიშული</Badge>}
            </CardTitle>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "company", company: c })}>
                <Pencil />
                რედაქტირება
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "contract", companyId: c.id, contract: null })}>
                <Plus />
                პირობა
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {c.contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">პირობები არ არის — კომპანია არაფერს ფარავს.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>სერვისი / კატეგორია</TableHead>
                    <TableHead className="text-right">დაფარვა</TableHead>
                    <TableHead className="text-right">ლიმიტი ერთეულზე</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.contracts.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="whitespace-normal">{k.targetName}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(k.coveragePercent)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{k.limitAmount ? formatGel(k.limitAmount) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ kind: "contract", companyId: c.id, contract: k })} aria-label="რედაქტირება">
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleting(k)} aria-label="წაშლა">
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing?.kind === "company" && <CompanyForm company={editing.company} onDone={() => setEditing(null)} />}
          {editing?.kind === "contract" && (
            <ContractForm
              companyId={editing.companyId}
              contract={editing.contract}
              services={services}
              categories={categories}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="პირობის წაშლა"
        description={<>ნამდვილად გსურთ „{deleting?.targetName}“-ის პირობის წაშლა? უკვე შექმნილი ინვოისები არ შეიცვლება.</>}
        pending={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function useSave(onDone: () => void) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) {
        toast.success(res.message);
        onDone();
        router.refresh();
      }
    });
  }
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const formError = result && !result.ok && !result.fieldErrors ? result.error : undefined;
  return { run, pending, errors, formError };
}

function CompanyForm({ company, onDone }: { company: CompanyAdminRow | null; onDone: () => void }) {
  const [name, setName] = useState(company?.name ?? "");
  const [isActive, setIsActive] = useState(company?.isActive ?? true);
  const { run, pending, errors, formError } = useSave(onDone);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCompanyAction({ id: company?.id, name, isActive }));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{company ? "კომპანიის რედაქტირება" : "ახალი სადაზღვევო კომპანია"}</DialogTitle>
        <DialogDescription>გათიშული კომპანიის პოლისი ახალ ინვოისებზე აღარ მოქმედებს.</DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField id="company-name" label="დასახელება *" error={errors.name}>
        <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" autoFocus />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        აქტიური
      </label>
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

const TARGETS = [
  { value: "service", label: "სერვისი" },
  { value: "category", label: "კატეგორია" },
] as const;

function ContractForm({
  companyId,
  contract,
  services,
  categories,
  onDone,
}: {
  companyId: number;
  contract: Contract | null;
  services: { id: number; label: string }[];
  categories: { id: number; name: string }[];
  onDone: () => void;
}) {
  const [target, setTarget] = useState<"service" | "category">(contract?.target ?? "service");
  const [serviceId, setServiceId] = useState<number | null>(contract?.target === "service" ? contract.targetId : null);
  const [categoryId, setCategoryId] = useState(String(contract?.target === "category" ? contract.targetId : (categories[0]?.id ?? "")));
  const [percent, setPercent] = useState(contract ? String(Number(contract.coveragePercent)) : "");
  const [limit, setLimit] = useState(contract?.limitAmount ?? "");
  const { run, pending, errors, formError } = useSave(onDone);
  const serviceItems: PickerItem[] = services.map((s) => ({ id: s.id, label: s.label }));
  const selectedService = services.find((s) => s.id === serviceId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          saveContractAction({
            id: contract?.id,
            companyId,
            target,
            serviceId: target === "service" ? serviceId : null,
            categoryId: target === "category" ? Number(categoryId) || null : null,
            coveragePercent: percent,
            limitAmount: limit,
          }),
        );
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{contract ? "პირობის რედაქტირება" : "ახალი პირობა"}</DialogTitle>
        <DialogDescription>სერვისის პირობა უპირატესია მისი კატეგორიის პირობაზე.</DialogDescription>
      </DialogHeader>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField id="contract-target" label="რას ფარავს">
        <SegmentedChoice id="contract-target" items={TARGETS} value={target} onChange={setTarget} />
      </FormField>
      {target === "service" ? (
        <FormField id="contract-service" label="სერვისი *" error={errors.targetId}>
          {selectedService ? (
            <div className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm">
              <span className="flex-1 truncate">{selectedService.label}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setServiceId(null)}>
                შეცვლა
              </Button>
            </div>
          ) : (
            <SearchPicker id="contract-service" items={serviceItems} onSelect={(i) => setServiceId(i.id)} placeholder="მოძებნეთ სერვისი" closeOnSelect />
          )}
        </FormField>
      ) : (
        <FormField id="contract-category" label="კატეგორია *" error={errors.targetId}>
          <NativeSelectClient
            id="contract-category"
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            className="h-10"
          />
        </FormField>
      )}
      <div className="grid grid-cols-2 gap-4">
        <FormField id="contract-percent" label="დაფარვა (%) *" error={errors.coveragePercent}>
          <Input id="contract-percent" value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" className="h-10 tabular-nums" />
        </FormField>
        <FormField id="contract-limit" label="ლიმიტი ერთეულზე (₾)" error={errors.limitAmount} hint="ცარიელი — ლიმიტის გარეშე">
          <Input id="contract-limit" value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" className="h-10 tabular-nums" />
        </FormField>
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
