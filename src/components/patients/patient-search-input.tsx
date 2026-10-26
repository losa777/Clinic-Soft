"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { startNavigationProgress } from "@/components/navigation-progress";
import { useRecentPatients } from "@/components/patients/recent-patients";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 350;

/** ძებნა იწყება 2 ასოდან ან პირადი ნომრის 4 ციფრიდან (უფრო მოკლეზე შედეგი ზედმეტად ბევრია). */
function readiness(q: string): "empty" | "short" | "ready" {
  if (!q) return "empty";
  if (/^\d+$/.test(q)) return q.length >= 4 ? "ready" : "short";
  return q.replace(/\s/g, "").length >= 2 ? "ready" : "short";
}

/**
 * საძიებო ველი: აკრეფისას ავტომატურად ეძებს (მისამართის ?q= განახლებით — შედეგებს სერვერი აბრუნებს),
 * Enter-ზე მაშინვე, ✕ ღილაკით სუფთავდება. ცარიელ ველზე დაჭერისას — ბოლო 50 პაციენტი (patientHref/<id>).
 */
export function PatientSearchInput({
  action,
  initialQuery,
  patientHref,
  invoiceHref,
}: {
  action: string;
  initialQuery: string;
  patientHref: string;
  /** ახალი ინვოისის მისამართი პაციენტის id-ის გარეშე (…/new?patientId=); null — ინვოისის უფლება არ აქვს */
  invoiceHref?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const lastSent = useRef(initialQuery);

  useEffect(() => () => clearTimeout(timer.current), []);
  const recent = useRecentPatients({
    inputRef: input,
    autoFocus: true,
    suppressed: value.trim() !== "",
    onPick: (p) => {
      startNavigationProgress();
      router.push(`${patientHref}/${p.id}`);
    },
    links: {
      invoice: invoiceHref ? (id) => `${invoiceHref}${id}` : null,
      view: (id) => `${patientHref}/${id}`,
    },
  });

  function navigate(raw: string) {
    clearTimeout(timer.current);
    const q = raw.trim().replace(/\s+/g, " ");
    // მოკლე ტექსტზე წინა შედეგები იშლება, რომ სხვა ძებნის შედეგი არ ჩანდეს
    const target = readiness(q) === "ready" ? q : "";
    if (target === lastSent.current) return;
    lastSent.current = target;
    startTransition(() => {
      router.replace(target ? `${action}?q=${encodeURIComponent(target)}` : action, { scroll: false });
    });
  }

  function change(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  function clear() {
    setValue("");
    navigate("");
    input.current?.focus();
  }

  const state = readiness(value.trim());

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(value);
      }}
      className="flex flex-col gap-1.5"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input}
          name="q"
          type="search"
          value={value}
          onChange={(e) => change(e.target.value)}
          {...recent.handlers}
          onKeyDown={(e) => {
            if (recent.onKeyDown(e)) return;
            if (e.key === "Escape" && value) clear();
          }}
          placeholder="მაგ. ნინო ბერიძე ან 01001012345"
          aria-label="სახელი, გვარი ან პირადი ნომერი"
          autoComplete="off"
          autoFocus
          className="h-11 pr-20 pl-9 text-base [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="ძებნა..." />}
          {value && (
            <button
              type="button"
              onClick={clear}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="გასუფთავება"
              title="გასუფთავება"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {recent.dropdown}
      </div>
      {state === "short" && (
        <p className="text-xs text-muted-foreground">
          {/^\d+$/.test(value.trim()) ? "პირადი ნომრით საძიებლად შეიყვანეთ მინიმუმ 4 ციფრი" : "შეიყვანეთ მინიმუმ 2 ასო"}
        </p>
      )}
    </form>
  );
}
