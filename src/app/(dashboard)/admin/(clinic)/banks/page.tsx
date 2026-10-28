import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { BanksManager } from "@/modules/finance/components/admin/banks-manager";
import { loadBanksAdmin } from "@/modules/finance/server/banks";

export const instant = false;

export const metadata: Metadata = { title: "ბანკები" };

export default async function BanksPage() {
  await requireRole("admin");
  const banks = await loadBanksAdmin();
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">ბანკები</h1>
        <p className="text-sm text-muted-foreground">
          ბარათით გადახდისას რეგისტრატორი ირჩევს ბანკს; ფინანსებში ბარათით შემოსული თანხები ბანკების მიხედვით ჩანს. გამოყენებული ბანკი
          არ იშლება — გათიშეთ.
        </p>
      </div>
      <BanksManager banks={banks} />
    </section>
  );
}
