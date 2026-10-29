"use client";

import { useRef, useState, useTransition } from "react";
import { Hand } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export type SortableItem = { id: number; label: string; content: React.ReactNode };

/**
 * ბარათების ბადე, რომლის რიგიც მომხმარებელი ცვლის: სახელურით (✋) გადათრევა (HTML5 drag & drop) ან კლავიატურით
 * (სახელურზე ფოკუსი → ისრები). ჩაგდების შემდეგ რიგი ინახება onSave-ით (შეცდომისას — უკან ბრუნდება).
 * content — სერვერზე დახატული ბარათი; ცოცხალი განახლებისას შიგთავსი ახლდება, რიგი — რჩება (ახალი — ბოლოს).
 */
export function SortableGrid({
  items,
  onSave,
  className,
}: {
  items: SortableItem[];
  onSave: (ids: number[]) => Promise<ActionResult>;
  className?: string;
}) {
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [, startSaving] = useTransition();
  const handles = useRef(new Map<number, HTMLButtonElement>());

  const byId = new Map(items.map((i) => [i.id, i]));
  // შენახული რიგი + ახლად გამოჩენილი (მაგ. ახალი სპეციალობა) ბოლოს; გაქრობილი — გამოიტოვება
  const ids = [...order.filter((id) => byId.has(id)), ...items.map((i) => i.id).filter((id) => !order.includes(id))];

  function commit(next: number[]) {
    const previous = ids;
    setOrder(next);
    startSaving(async () => {
      try {
        const res = await onSave(next);
        if (!res.ok) throw new Error(res.error);
      } catch {
        setOrder(previous);
        toast.error("რიგი ვერ შეინახა. სცადეთ თავიდან");
      }
    });
  }

  function move(id: number, toIndex: number) {
    const from = ids.indexOf(id);
    if (from < 0 || toIndex < 0 || toIndex >= ids.length || from === toIndex) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(toIndex, 0, id);
    commit(next);
  }

  function reset() {
    setArmed(null);
    setDragging(null);
    setOver(null);
  }

  return (
    <div className={className} role="list" aria-label="ბარათების რიგი — გადაათრიეთ სახელურით">
      {ids.map((id, index) => {
        const item = byId.get(id)!;
        return (
          <div
            key={id}
            role="listitem"
            draggable={armed === id}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(id));
              setDragging(id);
            }}
            onDragOver={(e) => {
              if (dragging === null || dragging === id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(id);
            }}
            onDragLeave={() => setOver((o) => (o === id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null && dragging !== id) move(dragging, index);
              reset();
            }}
            onDragEnd={reset}
            className={cn(
              "relative rounded-xl transition-[opacity,box-shadow]",
              dragging === id && "opacity-40",
              over === id && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              // სათაურს ადგილი სახელურისთვის
              "[&_[data-slot=card-title]]:pl-7",
            )}
          >
            <button
              ref={(el) => {
                if (el) handles.current.set(id, el);
                else handles.current.delete(id);
              }}
              type="button"
              aria-label={`${item.label} — გადატანა (ისრებით ან გადათრევით)`}
              title="გადაათრიეთ ბარათის გადასატანად"
              onPointerDown={() => setArmed(id)}
              onPointerUp={() => dragging === null && setArmed(null)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
                if (!step) return;
                e.preventDefault();
                move(id, index + step);
                // ფოკუსი სახელურზე რჩება (ბარათი გადაადგილდა)
                requestAnimationFrame(() => handles.current.get(id)?.focus());
              }}
              className="absolute top-4 left-2 z-10 flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
            >
              <Hand className="size-4" />
            </button>
            {item.content}
          </div>
        );
      })}
    </div>
  );
}
