"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const START_EVENT = "app:navigation-start";
/** თუ ნავიგაცია ვერ დასრულდა (გაუქმდა, შეცდომა) — ზოლი მაინც ქრება. */
const GIVE_UP_MS = 20_000;

/** პროგრამული გადასვლისთვის (router.push) — გამოიძახეთ push-მდე, რომ ზოლი გამოჩნდეს. */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

const currentUrl = () => location.pathname + location.search;

/** ბმული, რომელიც აპის შიგნით, იმავე ფანჯარაში სხვა გვერდზე გადადის (არა ფაილი/API/ახალი ჩანართი). */
function isAppNavigation(e: MouseEvent, a: HTMLAnchorElement) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  return url.pathname + url.search !== currentUrl();
}

/**
 * გვერდებს შორის გადასვლის ინდიკატორი: ზედა ზოლი (და მოლოდინის კურსორი), სანამ ახალი გვერდი სერვერიდან მოვა.
 * იწყება: ბმულზე დაჭერა, GET ფორმა (ფილტრები), უკან/წინ ღილაკები, startNavigationProgress(); მთავრდება — მისამართის შეცვლისას.
 */
export function NavigationProgress() {
  return (
    // useSearchParams-ს Suspense სჭირდება (სტატიკური გარსი)
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  );
}

function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = `${pathname}?${searchParams}`;
  // რომელი მისამართიდან დაიწყო გადასვლა: სანამ მისამართი იგივეა — იტვირთება; შეიცვალა — დასრულდა
  const [from, setFrom] = useState<string | null>(null);
  const urlRef = useRef(url);
  const giveUp = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  useEffect(() => {
    const start = () => {
      clearTimeout(giveUp.current);
      setFrom(urlRef.current);
      giveUp.current = setTimeout(() => setFrom(null), GIVE_UP_MS);
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a instanceof HTMLAnchorElement && isAppNavigation(e, a)) start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      // მხოლოდ GET ფორმები აპის მისამართზე (next/form ფილტრები) — Server Action-ის ფორმები გვერდს არ ცვლის.
      // capture ფაზა: next/form submit-ს თავად აჩერებს (preventDefault) და კლიენტზე გადადის
      if (form.getAttribute("action")?.startsWith("/") && form.method.toLowerCase() === "get") start();
    };
    // უკან/წინ: Next.js ზოგჯერ მაშინვე აჩვენებს (ქეშიდან) — მაშინ ზოლი არ სჭირდება
    const onPopState = () => {
      if (urlRef.current !== `${location.pathname}?${new URLSearchParams(location.search)}`) start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener(START_EVENT, start);
      clearTimeout(giveUp.current);
    };
  }, []);

  // მისამართი შეიცვალა — გადასვლა დასრულდა (state-ის განახლება რენდერისას, React-ის „წინა მნიშვნელობის“ შაბლონი)
  if (from !== null && from !== url) setFrom(null);
  const loading = from !== null;
  useEffect(() => {
    document.documentElement.classList.toggle("navigating", loading);
  }, [loading]);

  if (!loading) return null;
  return (
    <div role="progressbar" aria-label="გვერდი იტვირთება" aria-busy className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden">
      <div className="nav-progress-loading h-full bg-primary shadow-[0_0_8px] shadow-primary/60" />
    </div>
  );
}
