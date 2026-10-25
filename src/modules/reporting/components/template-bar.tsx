"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyTemplateAction, deleteTemplateAction, saveTemplateAction } from "@/modules/reporting/actions";

/**
 * ექსპორტის შაბლონები: შენახული სვეტების ნაკრების არჩევა ერთი დაჭერით (ხდება მიმდინარე, შენახული არჩევანი)
 * და მიმდინარე არჩევანის შენახვა სახელით.
 */
export function TemplateBar({ templates, columns }: { templates: { id: number; name: string; active: boolean }[]; columns: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> }>, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) return void toast.error(res.fieldErrors?.name ?? res.error ?? "მოქმედება ვერ შესრულდა");
        toast.success(res.message);
        onSuccess?.();
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Bookmark className="size-4" />
        შაბლონები
      </p>
      {templates.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center">
              <Button
                variant={t.active ? "default" : "outline"}
                size="sm"
                className="rounded-r-none"
                disabled={pending}
                onClick={() => run(() => applyTemplateAction(t.id))}
              >
                {t.name}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-l-none border-l-0 px-1.5"
                aria-label={`შაბლონის წაშლა: ${t.name}`}
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`წაიშალოს შაბლონი „${t.name}“?`)) run(() => deleteTemplateAction(t.id));
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">მონიშნეთ სვეტები და შეინახეთ შაბლონად — შემდეგ ერთი დაჭერით აირჩევთ.</p>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveTemplateAction({ name, columns }), () => setName(""));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="მაგ. ჯანდაცვის პორტალი" maxLength={100} className="h-9 w-64" />
        <Button type="submit" variant="outline" size="lg" disabled={pending || !name.trim()}>
          <Save />
          მონიშნული სვეტების შენახვა შაბლონად
        </Button>
      </form>
    </div>
  );
}
