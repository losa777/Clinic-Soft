"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PatientTab = { value: string; label: string; content: React.ReactNode };

/**
 * პაციენტის ბარათის ჩანართები. აქტიური ჩანართი მისამართშია (?tab=invoices), ამიტომ Tabs მართვადია:
 * ?tab=...-ზე გადასვლა ჩანართს ცვლის, ჩანართზე დაჭერა კი მისამართს history.replaceState-ით აახლებს
 * (სერვერთან მოთხოვნის გარეშე; Next.js useSearchParams-ს ასინქრონებს). პირველი ჩანართი — ნაგულისხმევი.
 */
export function PatientTabs({ tabs }: { tabs: PatientTab[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const value = tabs.some((t) => t.value === requested) ? requested! : tabs[0].value;

  function select(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === tabs[0].value) params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Tabs value={value} onValueChange={(v) => select(v as string)}>
      <TabsList className="h-9">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="px-3">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="pt-2">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
