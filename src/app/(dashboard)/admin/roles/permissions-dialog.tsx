"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ALL_PERMISSIONS, FULL_ACCESS_ROLE, PERMISSIONS } from "@/lib/permissions";
import { setRolePermissions } from "./actions";
import type { RoleRow } from "./roles-table";

/** როლის უფლებების მონიშვნა. ადმინისტრატორს ყველა უფლება აქვს (მხოლოდ სანახავად). */
export function PermissionsDialog({ role, onOpenChange }: { role: RoleRow | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={role !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{role && <PermissionsForm key={role.id} role={role} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function PermissionsForm({ role, onDone }: { role: RoleRow; onDone: () => void }) {
  const locked = role.code === FULL_ACCESS_ROLE;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(locked ? ALL_PERMISSIONS : role.permissions));
  const [pending, startTransition] = useTransition();

  function toggle(code: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await setRolePermissions({ roleId: role.id, codes: [...selected] });
          if (res.ok) {
            toast.success(res.message);
            onDone();
          } else toast.error(res.error);
        });
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>უფლებები — {role.name}</DialogTitle>
        <DialogDescription>
          {locked ? "ადმინისტრატორს ყველა უფლება აქვს და შეცვლა შეუძლებელია." : "ცვლილება მაშინვე მოქმედებს ამ როლის ყველა მომხმარებელზე."}
        </DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col divide-y rounded-lg border">
        {ALL_PERMISSIONS.map((code) => (
          <li key={code}>
            <label className="flex items-center gap-3 px-3 py-2 text-sm">
              <Switch checked={selected.has(code)} onCheckedChange={(on) => toggle(code, on)} disabled={locked} />
              <span className="flex-1">{PERMISSIONS[code]}</span>
              <code className="text-xs text-muted-foreground">{code}</code>
            </label>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          {locked ? "დახურვა" : "გაუქმება"}
        </Button>
        {!locked && (
          <Button type="submit" disabled={pending}>
            {pending ? "ინახება..." : "შენახვა"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
