"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { minutesText } from "@/modules/emr/minutes-text";

const TICK_MS = 30_000;

const subscribe = (cb: () => void) => {
  const t = setInterval(cb, TICK_MS);
  return () => clearInterval(t);
};
const tick = () => Math.floor(Date.now() / TICK_MS);

/**
 * გასული დრო „ელოდება 15 წთ“ — ბრაუზერში, ყოველ 30 წამში განახლებადი (სერვერზე არ რენდერდება — hydration-ის
 * სხვაობა არ არის). warnAt / alertAt — წუთები, რომლის შემდეგ ტექსტი ყვითლდება / წითლდება.
 */
export function ElapsedTime({ since, prefix, warnAt, alertAt }: { since: number; prefix: string; warnAt?: number; alertAt?: number }) {
  const now = useSyncExternalStore(subscribe, tick, () => null);
  if (now === null) return null;
  // now — 30-წამიანი ტიკი (სტაბილური snapshot); სიზუსტე წუთებისთვის საკმარისია
  const minutes = Math.max(0, Math.floor((now * TICK_MS - since) / 60_000));
  return (
    <span
      className={cn(
        "tabular-nums",
        alertAt !== undefined && minutes >= alertAt
          ? "font-medium text-red-600 dark:text-red-400"
          : warnAt !== undefined && minutes >= warnAt && "font-medium text-amber-700 dark:text-amber-300",
      )}
    >
      {prefix} {minutesText(minutes)}
    </span>
  );
}
