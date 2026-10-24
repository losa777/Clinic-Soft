"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Paperclip, TestTubeDiagonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { formatFileSize, MAX_FILE_SIZE } from "@/lib/patient-schema";
import { markProcedureDoneAction, markSampleTakenAction, submitResultAction } from "@/modules/emr/actions/fulfillment-actions";
import {
  linesFromNorm,
  type MaterialItem,
  type MaterialLine,
  type MaterialNorm,
  MaterialsEditor,
} from "@/modules/inventory/components/materials-editor";

/** საწყობი: შესრულებისას გასახარჯი მასალა (null — მომხმარებელს inventory.consume უფლება არ აქვს). */
export type OrderStock = { items: MaterialItem[]; norm: MaterialNorm[] } | null;

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message);
        onSuccess?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }
  return { run, pending };
}

/** ლაბორატორია: „ნიმუში აღებულია“ (მხოლოდ ლაბორატორიულ კვლევაზე, სტატუსით „დანიშნული“). */
export function SampleTakenButton({ orderId }: { orderId: number }) {
  const { run, pending } = useRun();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => markSampleTakenAction(orderId))}>
      <TestTubeDiagonal />
      ნიმუში აღებულია
    </Button>
  );
}

/** კვლევის შედეგი: ტექსტი და/ან ფაილი (JPG, PNG, PDF) → „მზადაა“, ექიმი შეტყობინებას იღებს. */
export function ResultForm({ orderId, stock }: { orderId: number; stock: OrderStock }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [materials, setMaterials] = useState<MaterialLine[]>(() => linesFromNorm(stock?.norm ?? []));
  const fileRef = useRef<HTMLInputElement>(null);
  const { run, pending } = useRun();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Check />
        შედეგის შეყვანა
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-lg border border-dashed p-2.5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const file = fileRef.current?.files?.[0];
        if (!text.trim() && !file) return toast.error("შეიყვანეთ შედეგი ან დაურთეთ ფაილი");
        if (file && file.size > MAX_FILE_SIZE) return toast.error(`ფაილი ${formatFileSize(MAX_FILE_SIZE)}-ზე დიდია`);
        const data = new FormData();
        data.set("orderId", String(orderId));
        data.set("resultText", text);
        if (file) data.set("file", file);
        if (stock) data.set("materials", JSON.stringify(materials));
        run(() => submitResultAction(data), () => setOpen(false));
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="შედეგი / დასკვნა"
        aria-label="შედეგი"
        rows={4}
        autoFocus
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Paperclip className="size-4 shrink-0" />
        <Input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" className="h-9" aria-label="ფაილი (JPG, PNG, PDF)" />
      </label>
      {stock && <MaterialsEditor items={stock.items} value={materials} onChange={setMaterials} disabled={pending} />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "ინახება..." : "შენახვა — მზადაა"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          გაუქმება
        </Button>
      </div>
    </form>
  );
}

/** ექთანი: პროცედურა შესრულებულია (შენიშვნით); გამოყენებული მასალა საწყობიდან ჩამოიწერება იმავე ოპერაციით. */
export function ProcedureDoneForm({ orderId, stock }: { orderId: number; stock: OrderStock }) {
  const [note, setNote] = useState("");
  const [materials, setMaterials] = useState<MaterialLine[]>(() => linesFromNorm(stock?.norm ?? []));
  const { run, pending } = useRun();
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        run(() => markProcedureDoneAction({ orderId, note, materials: stock ? materials : [] }));
      }}
    >
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="შენიშვნა (არასავალდებულო)" aria-label="შენიშვნა" className="h-8 min-w-48 flex-1" />
      <Button type="submit" size="sm" disabled={pending}>
        <Check />
        შესრულდა
      </Button>
      {stock && <MaterialsEditor items={stock.items} value={materials} onChange={setMaterials} disabled={pending} />}
    </form>
  );
}
