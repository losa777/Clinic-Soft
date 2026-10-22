import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Filter } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * ფილტრის ზოლი: GET ფორმა (next/form) — მნიშვნელობები URL-ში იწერება, გვერდი სერვერზე ხელახლა იკითხება.
 * კლიენტის JS არ სჭირდება.
 */
export function FilterBar({ action, children }: { action: string; children: React.ReactNode }) {
  return (
    <Form action={action} replace scroll={false} className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-3 print:hidden">
      {children}
      <Button type="submit" size="lg">
        <Filter />
        ფილტრი
      </Button>
    </Form>
  );
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function DateInput({ name, value }: { name: string; value: string }) {
  return <Input type="date" name={name} defaultValue={value} className="h-9 w-40" />;
}

/** ჩვეულებრივი <select> (GET ფორმაში მნიშვნელობა პირდაპირ იგზავნება). */
export function NativeSelect({
  name,
  value,
  options,
  className,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      className={cn(
        "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** გვერდები: წინა/შემდეგი ბმულებით (ფილტრები URL-ში რჩება). */
export function Pager({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const link = (target: number | null, label: string, icon: React.ReactNode) =>
    target ? (
      <Link href={href(target)} aria-label={label} className={buttonVariants({ variant: "outline", size: "icon" })} scroll={false}>
        {icon}
      </Link>
    ) : (
      <span aria-disabled className={cn(buttonVariants({ variant: "outline", size: "icon" }), "pointer-events-none opacity-50")}>
        {icon}
      </span>
    );
  return (
    <nav aria-label="გვერდები" className="flex items-center justify-end gap-2 text-sm text-muted-foreground print:hidden">
      <span>
        გვერდი {page} / {pageCount}
      </span>
      {link(page > 1 ? page - 1 : null, "წინა გვერდი", <ChevronLeft />)}
      {link(page < pageCount ? page + 1 : null, "შემდეგი გვერდი", <ChevronRight />)}
    </nav>
  );
}

/** CSV ექსპორტი (Excel ხსნის; UTF-8 BOM-ით ქართული სწორად ჩანს). */
export function ExportLink({ href }: { href: string }) {
  return (
    <a href={href} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "print:hidden")} download>
      <Download />
      Excel / CSV
    </a>
  );
}
