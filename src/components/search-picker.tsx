"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** keywords — დამატებითი საძიებო ტექსტი, რომელიც სიაში არ ჩანს (მაგ. სპეციალობის ექიმების გვარები). */
export type PickerItem = { id: number; label: string; detail?: string; keywords?: string };

const MAX_SHOWN = 50;

/** ყოველი სიტყვა უნდა შედიოდეს დასახელებაში (რიგი არ აქვს მნიშვნელობა): „ბერ ნინ“ → „ნინო ბერიძე“. */
function matches(item: PickerItem, words: string[]) {
  const text = `${item.label} ${item.keywords ?? ""}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

/**
 * ძებნადი სია (combobox): აკრეფისას იფილტრება, ისრებით და Enter-ით ირჩევა.
 * არჩევის შემდეგ ტექსტი სუფთავდება — რამდენიმე ელემენტის ზედიზედ ასარჩევად
 * (closeOnSelect — ერთის ასარჩევად: არჩევისას სია იხურება).
 */
export function SearchPicker({
  id,
  items,
  onSelect,
  placeholder,
  emptyText = "ვერაფერი მოიძებნა",
  invalid,
  autoFocus,
  closeOnSelect,
}: {
  id: string;
  items: PickerItem[];
  onSelect: (item: PickerItem) => void;
  placeholder: string;
  emptyText?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  closeOnSelect?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // autoFocus-ის (გვერდის ჩატვირთვისას) ფოკუსი სიას არ ხსნის — მხოლოდ დაწკაპუნება, აკრეფა ან ისარი
  const skipFocusOpen = useRef(Boolean(autoFocus));
  const position = useDropdownPosition(inputRef, open);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (words.length ? items.filter((i) => matches(i, words)) : items).slice(0, MAX_SHOWN);
  }, [items, query]);

  function select(item: PickerItem) {
    onSelect(item);
    setQuery("");
    setActive(0);
    if (closeOnSelect) setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (shown.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
    } else if (e.key === "Enter") {
      // Enter ფორმას არ აგზავნის — ირჩევს მონიშნულს
      e.preventDefault();
      if (open && shown[active]) select(shown[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].id}` : undefined}
        aria-invalid={invalid || undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          if (skipFocusOpen.current) skipFocusOpen.current = false;
          else setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        className="h-10 pl-8"
      />
      {/* body-ში (portal), რომ ბარათის overflow-hidden სიას არ ჭრიდეს */}
      {open && position && createPortal(
        <ul
          id={listId}
          role="listbox"
          style={position}
          className="fixed z-50 overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {shown.length === 0 && <li className="px-2 py-2 text-muted-foreground">{emptyText}</li>}
          {shown.map((item, i) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={i === active}
              // mousedown: input-ს ფოკუსი არ ეკარგება (onBlur სიას არ დახურავს არჩევამდე);
              // არჩევა — click-ზე, რომ სია mousedown-ზე არ გაქრეს და click სხვა ელემენტს (მაგ. ველს) არ მოხვდეს
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(item)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              {item.detail && <span className="shrink-0 text-muted-foreground tabular-nums">{item.detail}</span>}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

const MAX_LIST_HEIGHT = 288;

/** სიის პოზიცია ველის ქვემოთ (ან ზემოთ, თუ ქვემოთ ადგილი არ არის); გადახვევისას და ზომის შეცვლისას ახლდება. */
/** ჩამოსაშლელი სიის პოზიცია (fixed, body-ში): ველის ქვემოთ, ან ზემოთ — თუ ქვემოთ ადგილი არ არის. */
export function useDropdownPosition(anchor: React.RefObject<HTMLElement | null>, open: boolean) {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const showAbove = below < 160 && above > below;
      setStyle({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(MAX_LIST_HEIGHT, showAbove ? above : below),
        ...(showAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, open]);

  return open ? style : null;
}
