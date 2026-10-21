import { cn } from "@/lib/utils";

/** როლის სახელი დიდი შრიფტით, მთავრულად (`uppercase` ქართულს მთავრულად აჩვენებს). */
export function RoleTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-1 items-center justify-center py-16", className)}>
      <h1 className="text-center text-4xl font-bold tracking-wide text-primary uppercase sm:text-6xl">{children}</h1>
    </section>
  );
}
