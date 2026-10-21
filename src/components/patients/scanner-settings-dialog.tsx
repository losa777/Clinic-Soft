"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getScannerStatus,
  listScanners,
  saveScannerSettings,
  type ScannerDevice,
  type ScannerSettings,
} from "./scanner-client";

const AUTO = "auto";

const DPI_OPTIONS = [150, 200, 300, 600].map((dpi) => ({ value: String(dpi), label: `${dpi} DPI` }));
const BIT_DEPTH_OPTIONS = [
  { value: "color", label: "ფერადი" },
  { value: "gray", label: "შავ-თეთრი (ნაცრისფერი)" },
  { value: "bw", label: "შავ-თეთრი (ორფეროვანი)" },
];
const SOURCE_OPTIONS = [
  { value: "glass", label: "მინა (ბრტყელი)" },
  { value: "feeder", label: "ფიდერი (ADF)" },
  { value: "duplex", label: "ფიდერი, ორმხრივი" },
];

const deviceKey = (d: ScannerDevice) => `${d.driver}:${d.name}`;

/**
 * სკანერის პარამეტრები. არჩევანი ინახება აგენტის კონფიგში, ანუ ამ კომპიუტერზე
 * (ნებისმიერი ბრაუზერიდან ერთნაირად მუშაობს).
 */
export function ScannerSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>სკანერის პარამეტრები</DialogTitle>
          <DialogDescription>არჩევანი დაიმახსოვრება ამ კომპიუტერზე</DialogDescription>
        </DialogHeader>
        {open && <SettingsForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const [settings, setSettings] = useState<ScannerSettings | null>(null);
  const [devices, setDevices] = useState<ScannerDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();

  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getScannerStatus(), listScanners()])
      .then(([status, list]) => {
        if (!active) return;
        setSettings(status.settings);
        setDevices(list);
        setError(null);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reloads]);

  function load() {
    setLoading(true);
    setReloads((n) => n + 1);
  }

  function save() {
    if (!settings) return;
    startSaving(async () => {
      try {
        await saveScannerSettings(settings);
        toast.success("სკანერის პარამეტრები შენახულია");
        onDone();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const deviceItems = [
    { value: AUTO, label: "ავტომატურად (პირველი ხელმისაწვდომი)" },
    ...devices.map((d) => ({ value: deviceKey(d), label: `${d.name} (${d.driver.toUpperCase()})` })),
  ];
  // შენახული სკანერი შეიძლება ახლა გამორთული იყოს — სიაში მაინც ვაჩვენებთ
  if (settings?.device && !devices.some((d) => deviceKey(d) === deviceKey(settings.device!))) {
    deviceItems.push({ value: deviceKey(settings.device), label: `${settings.device.name} (მიუწვდომელია)` });
  }

  const set = <K extends keyof ScannerSettings>(key: K, value: ScannerSettings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {settings && (
        <>
          <FormField id="scanner-device" label="სკანერი" hint={devices.length ? undefined : "სკანერი ვერ მოიძებნა"}>
            <div className="flex gap-2">
              <SettingSelect
                id="scanner-device"
                items={deviceItems}
                value={settings.device ? deviceKey(settings.device) : AUTO}
                onChange={(v) => set("device", v === AUTO ? null : (devices.find((d) => deviceKey(d) === v) ?? settings.device))}
              />
              <Button variant="outline" size="icon-lg" onClick={load} disabled={loading} aria-label="სიის განახლება">
                <RefreshCw className={loading ? "animate-spin" : undefined} />
              </Button>
            </div>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="scanner-dpi" label="გარჩევადობა">
              <SettingSelect id="scanner-dpi" items={DPI_OPTIONS} value={String(settings.dpi)} onChange={(v) => set("dpi", Number(v))} />
            </FormField>
            <FormField id="scanner-bitdepth" label="ფერი">
              <SettingSelect
                id="scanner-bitdepth"
                items={BIT_DEPTH_OPTIONS}
                value={settings.bitDepth}
                onChange={(v) => set("bitDepth", v as ScannerSettings["bitDepth"])}
              />
            </FormField>
          </div>
          <FormField id="scanner-source" label="ქაღალდის წყარო">
            <SettingSelect
              id="scanner-source"
              items={SOURCE_OPTIONS}
              value={settings.source}
              onChange={(v) => set("source", v as ScannerSettings["source"])}
            />
          </FormField>
        </>
      )}

      {!settings && loading && <p className="text-sm text-muted-foreground">იტვირთება...</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={saving}>
          გაუქმება
        </Button>
        <Button onClick={save} disabled={!settings || saving}>
          {saving ? "ინახება..." : "შენახვა"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function SettingSelect({
  id,
  items,
  value,
  onChange,
}: {
  id: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v !== null && onChange(v as string)}>
      <SelectTrigger id={id} className="h-9 w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
