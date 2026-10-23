import { ACTIVITY_SEND_MS } from "@/modules/chat/presence";

/**
 * მომხმარებლის აქტივობა (მაუსი, კლავიატურა, სქროლი, შეხება) სტატუსისთვის.
 * - სერვერს ეგზავნება throttle-ით: პირველი მოძრაობა მაშინვე (🟡 → 🟢 დაყოვნების გარეშე), შემდეგ მაქსიმუმ ერთხელ ACTIVITY_SEND_MS-ში;
 * - ბოლო აქტივობის დრო ინახება localStorage-ში — ყველა ტაბისთვის საერთოა: ხელახლა დაკავშირებისას ფონური ტაბი
 *   სერვერს აცნობებს რეალურ უმოქმედობას (idleMs) და „აქტიურად“ არ აჩენს.
 */

const STORAGE_KEY = "clinic-chat:last-activity";
/** localStorage-ში ჩაწერა — მაქსიმუმ ერთხელ წამში. */
const STORE_MS = 1_000;

const EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;

let lastLocal = 0;

function readShared(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** რამდენი ms გავიდა ბოლო აქტივობიდან (ნებისმიერ ტაბში). */
export function idleMs(now = Date.now()): number {
  const last = Math.max(lastLocal, readShared());
  return last ? Math.max(0, now - last) : 0;
}

/** აქტივობის თვალყური; onActivity — სერვერზე შეტყობინება (throttle-ით). აბრუნებს გამორთვის ფუნქციას. */
export function trackActivity(onActivity: () => void): () => void {
  let lastSent = 0;
  let lastStored = 0;
  const handle = () => {
    const now = Date.now();
    lastLocal = now;
    if (now - lastStored >= STORE_MS) {
      lastStored = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // private რეჟიმი / აკრძალული საცავი — მხოლოდ ამ ტაბის დრო
      }
    }
    if (now - lastSent >= ACTIVITY_SEND_MS) {
      lastSent = now;
      onActivity();
    }
  };
  const onVisible = () => document.visibilityState === "visible" && handle();
  const options = { capture: true, passive: true } as const;
  for (const e of EVENTS) window.addEventListener(e, handle, options);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    for (const e of EVENTS) window.removeEventListener(e, handle, options);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
