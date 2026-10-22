"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** გვერდის ბეჭდვა (ანგარიშები): ზედა ზოლი, ნავიგაცია და ფილტრები print:hidden-ით იმალება. */
export function PrintButton({ label = "ბეჭდვა" }: { label?: string }) {
  return (
    <Button variant="outline" size="lg" onClick={() => window.print()} className="print:hidden">
      <Printer />
      {label}
    </Button>
  );
}
