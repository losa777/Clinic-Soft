import type { Metadata } from "next";
import { tbilisiToday } from "@/lib/appointment-slots";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { NumberingSettings, StampSettings } from "@/modules/finance/components/admin/document-settings";
import { SettingsForm } from "@/modules/finance/components/admin/settings-form";
import { NO_YEAR } from "@/modules/finance/server/numbering";
import { loadSettings } from "@/modules/finance/server/receipts";
import { loadStampPath } from "@/modules/finance/server/stamp";

export const instant = false;

export const metadata: Metadata = { title: "პარამეტრები" };

export default async function SettingsPage() {
  await requireRole("admin");
  const year = Number(tbilisiToday().slice(0, 4));
  const [settings, stampPath, sequences] = await Promise.all([
    loadSettings(),
    loadStampPath(),
    prisma.$queryRaw<{ name: string; year: number; last_value: number }[]>`
      SELECT name, year, last_value FROM number_sequences
      WHERE (name = 'F100' AND year = ${NO_YEAR}) OR (name = 'CARD' AND year = ${year})`,
  ]);
  const last = (name: string) => Number(sequences.find((s) => s.name === name)?.last_value ?? 0);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">კლინიკის რეკვიზიტები</h1>
        <p className="text-sm text-muted-foreground">ეს მონაცემები ქვითარზე და სამედიცინო დოკუმენტებზე (ფორმა 100) იბეჭდება.</p>
      </div>
      <SettingsForm initial={settings} />
      <div className="grid gap-4 lg:grid-cols-2">
        <StampSettings stampVersion={stampPath} />
        <NumberingSettings form100Last={last("F100")} cardLast={last("CARD")} year={year} />
      </div>
    </section>
  );
}
