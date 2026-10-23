"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { type PickerItem, SearchPicker } from "@/components/search-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { MEASUREMENT_SIDES, MEASUREMENT_TYPES, type MeasurementDef, normalText } from "@/modules/emr/measurements";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import {
  assignMeasurementAction,
  moveMeasurementAction,
  saveDefinitionAction,
  setMeasurementRequiredAction,
  setShowCommonVitalsAction,
  unassignMeasurementAction,
} from "../measurement-actions";

export type MeasurementRow = MeasurementDef & { usedInVisits: number; sharedWith: number };

const typeLabel = (t: string) => MEASUREMENT_TYPES.find((x) => x.value === t)?.label ?? t;
const sidesLabel = (s: string) => (s === "eyes" ? "OD / OS" : s === "limbs" ? "მარჯვ. / მარცხ." : "—");

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

/** სპეციალობის მაჩვენებლები: სია (რიგი, სავალდებულო, რედაქტირება, მოხსნა), ახლის შექმნა, კატალოგიდან დამატება. */
export function SpecialtyMeasurements({
  specialtyId,
  showCommonVitals,
  rows,
  catalog,
}: {
  specialtyId: number;
  showCommonVitals: boolean;
  rows: MeasurementRow[];
  catalog: PickerItem[];
}) {
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<MeasurementRow | "new" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={showCommonVitals} disabled={pending} onCheckedChange={(show) => run(() => setShowCommonVitalsAction({ specialtyId, show }))} />
            საერთო ვიტალური მაჩვენებლები (წნევა, პულსი, ტემპერატურა, SpO₂, სუნთქვა, წონა, სიმაღლე) ჩანდეს
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle>სპეციალობის მაჩვენებლები ({rows.length})</CardTitle>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {catalog.length > 0 && (
              <div className="w-72">
                <SearchPicker
                  id="catalog-picker"
                  items={catalog}
                  placeholder="კატალოგიდან დამატება..."
                  closeOnSelect
                  onSelect={(item) => run(() => assignMeasurementAction({ specialtyId, definitionId: item.id }))}
                />
              </div>
            )}
            <Button onClick={() => setEditing("new")}>
              <Plus />
              ახალი მაჩვენებელი
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">მაჩვენებელი ჯერ არ არის. დაამატეთ ახალი ან აირჩიეთ კატალოგიდან.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">რიგი</TableHead>
                  <TableHead>დასახელება</TableHead>
                  <TableHead>ტიპი</TableHead>
                  <TableHead>მხარე</TableHead>
                  <TableHead>ფარგლები / ნორმა</TableHead>
                  <TableHead className="text-center">სავალდებულო</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex">
                        <Button size="icon-sm" variant="ghost" disabled={pending || i === 0} aria-label="ზემოთ" onClick={() => run(() => moveMeasurementAction({ specialtyId, definitionId: r.id, direction: "up" }))}>
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={pending || i === rows.length - 1}
                          aria-label="ქვემოთ"
                          onClick={() => run(() => moveMeasurementAction({ specialtyId, definitionId: r.id, direction: "down" }))}
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{r.name}</span>
                      {r.unit && <span className="text-muted-foreground"> ({r.unit})</span>}
                      {r.sharedWith > 0 && <span className="block text-xs text-muted-foreground">სხვა სპეციალობაშიც: {r.sharedWith}</span>}
                    </TableCell>
                    <TableCell>
                      {typeLabel(r.type)}
                      {r.type === "select" && <span className="block max-w-56 truncate text-xs text-muted-foreground">{r.options.join(", ")}</span>}
                    </TableCell>
                    <TableCell>{sidesLabel(r.sides)}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.type === "number" ? (
                        <>
                          {r.min ?? "…"}–{r.max ?? "…"}
                          {normalText(r) && <span className="block text-xs text-muted-foreground">ნორმა {normalText(r)}</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.required}
                        disabled={pending}
                        aria-label={`${r.name}: სავალდებულო`}
                        onCheckedChange={(required) => run(() => setMeasurementRequiredAction({ specialtyId, definitionId: r.id, required }))}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label="რედაქტირება" title="რედაქტირება" onClick={() => setEditing(r)}>
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={pending}
                          aria-label="სპეციალობიდან მოხსნა"
                          title="სპეციალობიდან მოხსნა (ძველი მნიშვნელობები რჩება)"
                          onClick={() => run(() => unassignMeasurementAction({ specialtyId, definitionId: r.id }))}
                        >
                          <X />
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

      {editing && (
        <DefinitionDialog key={editing === "new" ? "new" : editing.id} specialtyId={specialtyId} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

const str = (v: number | null) => (v === null ? "" : String(v));

/** მაჩვენებლის შექმნა / რედაქტირება. რედაქტირება ცნობარშია — ყველა სპეციალობაზე აისახება. */
function DefinitionDialog({ specialtyId, row, onClose }: { specialtyId: number; row: MeasurementRow | null; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    name: row?.name ?? "",
    unit: row?.unit ?? "",
    type: row?.type ?? "number",
    sides: row?.sides ?? "none",
    min: str(row?.min ?? null),
    max: str(row?.max ?? null),
    normalMin: str(row?.normalMin ?? null),
    normalMax: str(row?.normalMax ?? null),
    decimals: String(row?.decimals ?? 0),
    options: row?.options.join("\n") ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const locked = Boolean(row && row.usedInVisits > 0);
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [key]: e.target.value }));

  function save() {
    startTransition(async () => {
      try {
        const res = await saveDefinitionAction({
          id: row?.id,
          specialtyId,
          values: { ...v, type: v.type as MeasurementDef["type"], sides: v.sides as MeasurementDef["sides"], decimals: Number(v.decimals) || 0 },
        });
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          toast.error(res.error);
          return;
        }
        toast.success(res.message);
        onClose();
        router.refresh();
      } catch {
        toast.error("შენახვა ვერ მოხერხდა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "მაჩვენებლის რედაქტირება" : "ახალი მაჩვენებელი"}</DialogTitle>
          <DialogDescription>
            {row && row.sharedWith > 0
              ? `ცვლილება აისახება ყველა სპეციალობაზე, სადაც ეს მაჩვენებელია (${row.sharedWith + 1}).`
              : "ექიმი ამ მაჩვენებელს ვიზიტის ფორმაში დაინახავს."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="sm:col-span-2">
            <FormField id="def-name" label="დასახელება *" error={errors.name}>
              <Input id="def-name" value={v.name} onChange={set("name")} placeholder="მაგ. თვალშიდა წნევა (T)" className="h-9" autoFocus />
            </FormField>
          </div>
          <FormField id="def-type" label="ტიპი" error={errors.type} hint={locked ? "ვიზიტებში უკვე გამოყენებულია — არ იცვლება" : undefined}>
            <NativeSelectClient id="def-type" value={v.type} onChange={(type) => !locked && setV((x) => ({ ...x, type: type as typeof x.type }))} options={MEASUREMENT_TYPES} />
          </FormField>
          <FormField id="def-sides" label="მხარე" error={errors.sides}>
            <NativeSelectClient id="def-sides" value={v.sides} onChange={(sides) => !locked && setV((x) => ({ ...x, sides: sides as typeof x.sides }))} options={MEASUREMENT_SIDES} />
          </FormField>
          {v.type === "number" && (
            <>
              <FormField id="def-unit" label="ერთეული" error={errors.unit}>
                <Input id="def-unit" value={v.unit} onChange={set("unit")} placeholder="მმ Hg, D, მმოლ/ლ..." className="h-9" />
              </FormField>
              <FormField id="def-decimals" label="ათწილადი ნიშნები" error={errors.decimals}>
                <NativeSelectClient id="def-decimals" value={v.decimals} onChange={(decimals) => setV((x) => ({ ...x, decimals }))} options={["0", "1", "2", "3", "4"].map((d) => ({ value: d, label: d }))} />
              </FormField>
              <FormField id="def-min" label="დასაშვები მინიმუმი" error={errors.min} hint="ამაზე ნაკლებს სისტემა არ მიიღებს">
                <Input id="def-min" value={v.min} onChange={set("min")} inputMode="decimal" className="h-9" />
              </FormField>
              <FormField id="def-max" label="დასაშვები მაქსიმუმი" error={errors.max}>
                <Input id="def-max" value={v.max} onChange={set("max")} inputMode="decimal" className="h-9" />
              </FormField>
              <FormField id="def-nmin" label="ნორმა — დან" error={errors.normalMin} hint="გადაცდენისას ექიმი ↑/↓ ნიშანს ხედავს">
                <Input id="def-nmin" value={v.normalMin} onChange={set("normalMin")} inputMode="decimal" className="h-9" />
              </FormField>
              <FormField id="def-nmax" label="ნორმა — მდე" error={errors.normalMax}>
                <Input id="def-nmax" value={v.normalMax} onChange={set("normalMax")} inputMode="decimal" className="h-9" />
              </FormField>
            </>
          )}
          {v.type === "select" && (
            <div className="sm:col-span-2">
              <FormField id="def-options" label="ვარიანტები *" error={errors.options} hint="თითო ვარიანტი — ცალკე სტრიქონზე">
                <Textarea id="def-options" value={v.options} onChange={set("options")} rows={5} placeholder={"სინუსური\nმოციმციმე არითმია"} />
              </FormField>
            </div>
          )}
          {v.type === "text" && (
            <div className="sm:col-span-2">
              <FormField id="def-unit" label="ერთეული (არასავალდებულო)" error={errors.unit}>
                <Input id="def-unit" value={v.unit} onChange={set("unit")} className="h-9" />
              </FormField>
            </div>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              გაუქმება
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "ინახება..." : row ? "შენახვა" : "დამატება"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
