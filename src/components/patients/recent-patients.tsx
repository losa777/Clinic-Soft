"use client";

import { type RefObject, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { FilePlus2, Loader2, UserRound } from "lucide-react";
import { useDropdownPosition } from "@/components/search-picker";
import { buttonVariants } from "@/components/ui/button";
import type { PatientSearchRow } from "@/lib/patient-records";
import { recentPatientsAction } from "@/lib/recent-patients-action";
import { cn } from "@/lib/utils";

/**
 * ძებნის ველზე დაჭერისას — ბოლო 50 პაციენტი ჩამოსაშლელ სიაში (ექიმს — საკუთარი ბოლოს ნანახი, სხვებს —
 * ბოლოს დარეგისტრირებული). გვერდის გახსნისას ავტომატური ფოკუსი (autoFocus) სიას არ ხსნის — მხოლოდ დაჭერა ან Tab.
 * აკრეფისას (suppressed = true) სია იხურება და ჩვეულებრივი ძებნა მუშაობს. ისრები / Enter / Esc.
 */
export function useRecentPatients({
  inputRef,
  autoFocus,
  suppressed,
  onPick,
  links,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** ველში უკვე რამე წერია — სია არ ჩანს */
  suppressed: boolean;
  onPick: (patient: PatientSearchRow) => void;
  /** ღილაკები სტრიქონზე: „ინვოისი“ (უფლებით; null — არ ჩანს) და „სრულად ნახვა“ */
  links?: { invoice: ((id: number) => string) | null; view: (id: number) => string };
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PatientSearchRow[] | null>(null);
  const [active, setActive] = useState(0);
  const skipAutoFocus = useRef(Boolean(autoFocus));
  const request = useRef(0);
  const visible = open && !suppressed;
  const position = useDropdownPosition(inputRef, visible);

  function show() {
    if (open) return;
    setOpen(true);
    setActive(0);
    setRows(null);
    const id = ++request.current;
    recentPatientsAction()
      .then((r) => id === request.current && setRows(r))
      .catch(() => id === request.current && setRows([]));
  }

  function pick(p: PatientSearchRow) {
    setOpen(false);
    onPick(p);
  }

  const handlers = {
    onFocus: () => {
      if (skipAutoFocus.current) skipAutoFocus.current = false;
      else show();
    },
    onClick: show,
    onBlur: () => setOpen(false),
  };

  /** ისრები/Enter/Esc სიაში; true — კლავიში დამუშავდა (ველის საკუთარი ქცევა აღარ სჭირდება). */
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): boolean {
    if (!visible) {
      if (e.key === "ArrowDown" && !suppressed) {
        e.preventDefault();
        show();
        return true;
      }
      return false;
    }
    const n = rows?.length ?? 0;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
      return true;
    }
    if (e.key === "Enter" && rows?.[active]) {
      e.preventDefault();
      pick(rows[active]);
      return true;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return true;
    }
    return false;
  }

  const dropdown =
    visible && position
      ? createPortal(
          <ul
            role="listbox"
            aria-label="ბოლო პაციენტები"
            style={position}
            className="fixed z-50 overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            <li role="presentation" className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
              ბოლო პაციენტები — ან აკრიფეთ სახელი, გვარი, პირადი ნომერი
            </li>
            {rows === null && (
              <li role="presentation" className="flex items-center gap-2 px-2 py-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                იტვირთება...
              </li>
            )}
            {rows?.length === 0 && (
              <li role="presentation" className="px-2 py-2 text-muted-foreground">
                პაციენტი ჯერ არ არის
              </li>
            )}
            {rows?.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                // ველი ფოკუსს არ კარგავს — დაჭერამდე სია არ იხურება
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                  <UserRound className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {p.lastName} {p.firstName}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">{p.personalId}</span>
                <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{p.birthDate}</span>
                {links && (
                  // ღილაკის დაჭერა სტრიქონის არჩევას არ იწვევს (stopPropagation) — ბმული თავად გადადის
                  <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {links.invoice && (
                      <Link href={links.invoice(p.id)} onClick={() => setOpen(false)} className={buttonVariants({ size: "xs" })}>
                        <FilePlus2 />
                        ინვოისი
                      </Link>
                    )}
                    <Link href={links.view(p.id)} onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline", size: "xs" })}>
                      სრულად ნახვა
                    </Link>
                  </span>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return { handlers, onKeyDown, dropdown };
}
