"use client";

import { useId, useState } from "react";
import { BellRing, CircleMinus, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useChat, useChatClient } from "@/modules/chat/client/provider";
import { notificationPermission, playSound, requestNotificationPermission } from "@/modules/chat/client/notify";

/** ჩატის პარამეტრები: „არ შემაწუხოთ“, ხმა, ბრაუზერის შეტყობინებები (ინახება პროფილში — ბაზაში). */
export function ChatSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const client = useChatClient();
  const settings = useChat((s) => s.settings);
  const dnd = useChat((s) => s.manualStatus === "dnd");
  const [permission, setPermission] = useState(() => (typeof window === "undefined" ? "default" : notificationPermission()));

  const toggleNotifications = async (on: boolean) => {
    if (on) setPermission(await requestNotificationPermission());
    await client.updateSettings({ notificationsEnabled: on });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ჩატის პარამეტრები</DialogTitle>
          <DialogDescription>ინახება თქვენს პროფილში და მოქმედებს ყველა კომპიუტერზე.</DialogDescription>
        </DialogHeader>
        <div className="divide-y">
          <SettingRow
            icon={<CircleMinus className="text-red-500" />}
            title="არ შემაწუხოთ"
            description="სხვები ხედავენ 🔴 სტატუსს; ახალ შეტყობინებაზე — მხოლოდ რაოდენობა, ხმისა და შეტყობინების გარეშე."
            checked={dnd}
            onChange={(on) => void client.setDoNotDisturb(on)}
          />
          <SettingRow
            icon={<Volume2 />}
            title="ხმა"
            description="მოკლე სიგნალი ახალ შეტყობინებაზე."
            checked={settings.soundEnabled}
            onChange={(on) => void client.updateSettings({ soundEnabled: on })}
            extra={
              <Button variant="link" size="sm" className="h-auto px-0" onClick={playSound}>
                ხმის შემოწმება
              </Button>
            }
          />
          <SettingRow
            icon={<BellRing />}
            title="ბრაუზერის შეტყობინებები"
            description="როცა ჩატის ფანჯარა აქტიური არ არის."
            checked={settings.notificationsEnabled}
            onChange={(on) => void toggleNotifications(on)}
            extra={
              permission === "denied" ? (
                <p className="text-xs text-destructive">ბრაუზერში აკრძალულია — დაუშვით საიტის პარამეტრებიდან (🔒 მისამართის ზოლში).</p>
              ) : permission === "unsupported" ? (
                <p className="text-xs text-muted-foreground">ეს ბრაუზერი შეტყობინებებს არ უჭერს მხარს.</p>
              ) : settings.notificationsEnabled && permission === "default" ? (
                <Button variant="link" size="sm" className="h-auto px-0" onClick={async () => setPermission(await requestNotificationPermission())}>
                  ბრაუზერის ნებართვის მიცემა
                </Button>
              ) : null
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({
  icon,
  title,
  description,
  checked,
  onChange,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  extra?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 py-3 [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0">
      {icon}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-medium">
          {title}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
        {extra}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={undefined} />
    </div>
  );
}
