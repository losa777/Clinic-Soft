"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * ღია / მუქი / სისტემური თემა. არჩევანი ინახება ამ ბრაუზერში (localStorage); სისტემური — ოპერაციული სისტემის პარამეტრით.
 * გვერდის ჩატვირთვისას კლასს `dark` სვამს THEME_SCRIPT (layout.tsx), აქ — არჩევის შეცვლისას.
 */
export type Theme = "light" | "dark" | "system";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme() {
  const theme = readTheme();
  const dark = theme === "dark" || (theme === "system" && window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // პირადი რეჟიმი/დაბლოკილი storage: თემა მხოლოდ ამ გვერდზე შეიცვლება
  }
  applyTheme();
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  // სისტემის თემის შეცვლა და სხვა ჩანართში არჩევა
  const update = () => {
    applyTheme();
    onChange();
  };
  const media = window.matchMedia(DARK_QUERY);
  listeners.add(onChange);
  media.addEventListener("change", update);
  window.addEventListener("storage", update);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", update);
    window.removeEventListener("storage", update);
  };
}

const isDark = () => document.documentElement.classList.contains("dark");

/** theme — არჩეული; resolvedTheme — რეალურად ნაჩვენები (სერვერზე და hydration-ისას: system / light). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return { theme, resolvedTheme: dark ? ("dark" as const) : ("light" as const), setTheme };
}

const OPTIONS = [
  { value: "light", label: "ღია", icon: Sun },
  { value: "dark", label: "მუქი", icon: Moon },
  { value: "system", label: "სისტემური", icon: Monitor },
] as const;

/** თემის ასარჩევი ღილაკი (ზედა პანელი, შესვლის გვერდი). */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme } = useTheme();
  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon-lg" className={className} aria-label="თემა" title="თემა: ღია / მუქი" />}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <ItemIcon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
