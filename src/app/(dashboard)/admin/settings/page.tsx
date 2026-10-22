import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { SettingsForm } from "@/modules/finance/components/admin/settings-form";
import { loadSettings } from "@/modules/finance/server/receipts";

export const instant = false;

export const metadata: Metadata = { title: "პარამეტრები" };

export default async function SettingsPage() {
  await requireRole("admin");
  const settings = await loadSettings();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">კლინიკის რეკვიზიტები</h1>
        <p className="text-sm text-muted-foreground">ეს მონაცემები ქვითარზე იბეჭდება.</p>
      </div>
      <SettingsForm initial={settings} />
    </section>
  );
}
