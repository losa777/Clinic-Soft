"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "info" | "visits";

/**
 * პაციენტის ბარათის ჩანართები. აქტიური ჩანართი მისამართშია (?tab=visits), ამიტომ Tabs მართვადია:
 * ვიზიტის შენახვის შემდეგ ?tab=visits-ზე გადასვლა ჩანართს ცვლის, ჩანართზე დაჭერა კი მისამართს
 * history.replaceState-ით აახლებს (სერვერთან მოთხოვნის გარეშე; Next.js useSearchParams-ს ასინქრონებს).
 */
export function PatientTabs({
  visitCount,
  info,
  visits,
}: {
  visitCount: number;
  info: React.ReactNode;
  visits: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value: Tab = searchParams.get("tab") === "visits" ? "visits" : "info";

  function select(next: Tab) {
    const params = new URLSearchParams(searchParams);
    if (next === "visits") params.set("tab", "visits");
    else params.delete("tab");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Tabs value={value} onValueChange={(v) => select(v as Tab)}>
      <TabsList className="h-9">
        <TabsTrigger value="info" className="px-3">
          პაციენტის მონაცემები
        </TabsTrigger>
        <TabsTrigger value="visits" className="px-3">
          ვიზიტები ({visitCount})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="info" className="pt-2">
        {info}
      </TabsContent>
      <TabsContent value="visits" className="pt-2">
        {visits}
      </TabsContent>
    </Tabs>
  );
}
