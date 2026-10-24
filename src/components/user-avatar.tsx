import { avatarUrl } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

const TINTS = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
];

export type AvatarUser = { id: number; firstName: string; lastName: string; avatar?: number | null };

/**
 * მრგვალი პროფილის ფოტო; ფოტოს გარეშე — ინიციალები ფერად წრეში (ფერი userId-ით, ყველგან ერთნაირი).
 * large — 256 პიქსელიანი ვერსია (პროფილის გვერდი), სხვაგან — 64.
 */
export function Avatar({ user, className, large = false }: { user: AvatarUser; className?: string; large?: boolean }) {
  const base = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium select-none", className);
  if (user.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ავტორიზებული API, ბრაუზერის ქეშით; next/image-ის ოპტიმიზაცია აქ ზედმეტია
      <img src={avatarUrl(user.id, user.avatar, large ? 256 : 64)} alt="" className={cn(base, "bg-muted object-cover")} loading="lazy" decoding="async" />
    );
  }
  return (
    <span className={cn(base, TINTS[user.id % TINTS.length])} aria-hidden>
      {user.firstName.charAt(0)}
      {user.lastName.charAt(0)}
    </span>
  );
}
