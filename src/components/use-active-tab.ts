"use client";

import { useEffect, useRef } from "react";

/** ჩანართების ზოლი: აქტიური ჩანართი (aria-current="page") ყოველთვის ჩანს — საჭიროებისას ზოლი თავად გადაიხვევა. */
export function useActiveTabIntoView<T extends HTMLElement>(pathname: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const left = active.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: left - (nav.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [pathname]);
  return ref;
}
