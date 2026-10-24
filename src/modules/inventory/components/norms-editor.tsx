"use client";

import { useMemo, useState, useTransition } from "react";
import { Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SearchPicker } from "@/components/search-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NativeSelectClient } from "@/modules/finance/components/native-select";
import { saveNormsAction } from "@/modules/inventory/actions";
import type { NormServiceRow } from "@/modules/inventory/server/norms";
import { formatQuantity, inputQuantity } from "@/modules/inventory/stock";

type Line = { itemId: number; name: string; unit: string; quantity: string };

const ORDER_TYPE_LABELS: Record<string, string> = { lab: "ლაბორატორია", instrumental: "ინსტრუმენტული", procedure: "პროცედურა" };

/**
 * ნორმები: სერვისი → რა მასალა იხარჯება ერთ შესრულებაზე. ექთანი/ლაბორანტი შესრულებისას ნორმას წინასწარ შევსებულს ხედავს.
 */
export function NormsEditor({ services, items }: { services: NormServiceRow[]; items: { id: number; name: string; unit: string }[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("orders");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(
      (s) =>
        (filter === "all" || (filter === "orders" ? s.orderType !== null : filter === "with" ? s.lines.length > 0 : s.lines.length === 0)) &&
        (!q || `${s.name} ${s.category ?? ""}`.toLowerCase().includes(q)),
    );
  }, [services, search, filter]);
  const selected = services.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card className="min-w-0">
        <CardContent className="flex flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ძებნა სერვისით" className="h-9 pl-8" aria-label="ძებნა" />
          </div>
          <NativeSelectClient
            id="norms-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "orders", label: "დანიშნულებები (პროცედურა, კვლევა)" },
              { value: "with", label: "ნორმით" },
              { value: "without", label: "ნორმის გარეშე" },
              { value: "all", label: "ყველა სერვისი" },
            ]}
          />
          <ul className="max-h-[32rem] divide-y overflow-y-auto rounded-lg border text-sm">
            {shown.length === 0 && <li className="px-3 py-4 text-center text-muted-foreground">სერვისი ვერ მოიძებნა</li>}
            {shown.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  aria-current={s.id === selectedId || undefined}
                  className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50", s.id === selectedId && "bg-accent text-accent-foreground")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{[s.orderType && ORDER_TYPE_LABELS[s.orderType], s.category].filter(Boolean).join(" · ")}</span>
                  </span>
                  {s.lines.length > 0 && <Badge variant="secondary">{s.lines.length}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {selected ? (
        <NormForm key={selected.id} service={selected} items={items} />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">აირჩიეთ სერვისი მარცხნივ</CardContent>
        </Card>
      )}
    </div>
  );
}

function NormForm({ service, items }: { service: NormServiceRow; items: { id: number; name: string; unit: string }[] }) {
  const [lines, setLines] = useState<Line[]>(service.lines.map((l) => ({ ...l, quantity: inputQuantity(l.quantity) })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const used = new Set(lines.map((l) => l.itemId));

  function save() {
    startTransition(async () => {
      const res = await saveNormsAction({ serviceId: service.id, lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(res.message);
    });
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{service.name}</CardTitle>
        <p className="text-sm text-muted-foreground">მასალა ერთ შესრულებაზე. შემსრულებელი რაოდენობას შესრულებისას ასწორებს.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SearchPicker
          id="norm-items"
          items={items.filter((i) => !used.has(i.id)).map((i) => ({ id: i.id, label: i.name, detail: i.unit }))}
          onSelect={(p) => {
            const item = items.find((i) => i.id === p.id);
            if (item) setLines((list) => [...list, { itemId: item.id, name: item.name, unit: item.unit, quantity: "1" }]);
          }}
          placeholder="დაამატეთ დასახელება"
        />
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">ნორმა ცარიელია — მასალა ავტომატურად არ შეივსება</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {lines.map((l, i) => (
              <li key={l.itemId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-40 flex-1 font-medium">{l.name}</span>
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={`რაოდენობა — ${l.name}`}
                    value={l.quantity}
                    onChange={(e) => setLines((list) => list.map((x) => (x.itemId === l.itemId ? { ...x, quantity: e.target.value } : x)))}
                    inputMode="decimal"
                    aria-invalid={Boolean(errors[`lines.${i}.quantity`])}
                    className="h-8 w-20 tabular-nums"
                  />
                  <span className="w-16 text-xs text-muted-foreground">{l.unit}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setLines((list) => list.filter((x) => x.itemId !== l.itemId))}
                  aria-label={`წაშლა — ${l.name}`}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 />
                </Button>
                {errors[`lines.${i}.quantity`] && <p className="w-full text-xs text-destructive">{errors[`lines.${i}.quantity`]}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {service.lines.length > 0 && `შენახული: ${service.lines.map((l) => `${l.name} × ${formatQuantity(l.quantity)}`).join(", ")}`}
          </span>
          <Button onClick={save} disabled={pending}>
            <Save />
            {pending ? "ინახება..." : "შენახვა"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
