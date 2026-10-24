"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AvatarEditor } from "@/components/avatar-editor";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action-result";
import { PASSWORD_HINT } from "@/lib/password-policy";
import { createUser, updateUser } from "./actions";
import type { RoleOption, UserRow } from "./users-table";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ახალი მომხმარებელი */
  user: UserRow | null;
  roles: RoleOption[];
  isSelf: boolean;
};

export function UserDialog({ open, onOpenChange, user, roles, isSelf }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "მომხმარებლის რედაქტირება" : "ახალი მომხმარებელი"}</DialogTitle>
          <DialogDescription>
            {user ? `${user.firstName} ${user.lastName} (${user.username})` : "შეავსეთ ყველა ველი"}
          </DialogDescription>
        </DialogHeader>
        {/* ფოტო ცალკე ინახება (მაშინვე), ფორმის „შენახვისგან“ დამოუკიდებლად */}
        {user && <AvatarEditor user={user} forUserId={user.id} />}
        {/* key: ყოველ გახსნაზე ფორმა თავიდან ივსება */}
        <UserForm key={user?.id ?? "new"} user={user} roles={roles} isSelf={isSelf} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function UserForm({ user, roles, isSelf, onDone }: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const [values, setValues] = useState({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    username: user?.username ?? "",
    password: "",
    roleId: user ? String(user.roleId) : "",
    extraRoleIds: user?.extraRoles.map((r) => r.id) ?? [],
    isActive: user?.isActive ?? true,
  });
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // მთავარი როლი დამატებითებში არ მეორდება
      const payload = { ...values, roleId: Number(values.roleId), extraRoleIds: values.extraRoleIds.filter((id) => String(id) !== values.roleId) };
      const res = user ? await updateUser({ ...payload, id: user.id }) : await createUser(payload);
      setResult(res);
      if (res.ok) {
        toast.success(res.message);
        onDone();
      }
    });
  }

  const input = (key: "firstName" | "lastName" | "username" | "password") => ({
    id: `user-${key}`,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
    "aria-invalid": errors[key] ? true : undefined,
    className: "h-10",
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {result && !result.ok && result.error && !result.fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="user-firstName" label="სახელი" error={errors.firstName}>
          <Input {...input("firstName")} autoFocus />
        </FormField>
        <FormField id="user-lastName" label="გვარი" error={errors.lastName}>
          <Input {...input("lastName")} />
        </FormField>
      </div>

      <FormField id="user-username" label="მომხმარებელი (შესვლისთვის)" error={errors.username} hint="ლათინური ასოები, ციფრები და . _ -">
        <Input {...input("username")} autoCapitalize="none" autoComplete="off" spellCheck={false} />
      </FormField>

      <FormField
        id="user-password"
        label={user ? "ახალი პაროლი" : "პაროლი"}
        error={errors.password}
        hint={user ? `დატოვეთ ცარიელი, თუ პაროლს არ ცვლით. ${PASSWORD_HINT}; შეცვლისას მომხმარებელი სისტემიდან გამოვა` : PASSWORD_HINT}
      >
        <Input {...input("password")} type="password" autoComplete="new-password" />
      </FormField>

      <FormField id="user-role" label="მთავარი როლი" error={errors.roleId} hint={isSelf ? "საკუთარ მთავარ როლს ვერ შეცვლით" : "შესვლისას ეს როლი იხსნება"}>
        <Select
          items={roles}
          value={values.roleId || null}
          onValueChange={(v) => set("roleId", (v as string | null) ?? "")}
          disabled={isSelf}
        >
          <SelectTrigger id="user-role" className="h-10 w-full" aria-invalid={errors.roleId ? true : undefined}>
            <SelectValue placeholder="აირჩიეთ როლი" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <ExtraRoles
        roles={roles.filter((r) => r.value !== values.roleId)}
        selected={values.extraRoleIds}
        onChange={(ids) => set("extraRoleIds", ids)}
      />

      <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
        <div>
          <Label htmlFor="user-active">აქტიური</Label>
          <p className="text-xs text-muted-foreground">
            {isSelf ? "საკუთარ ანგარიშს ვერ გათიშავთ" : "გათიშული მომხმარებელი სისტემაში ვერ შედის"}
          </p>
        </div>
        <Switch id="user-active" checked={values.isActive} onCheckedChange={(c) => set("isActive", c)} disabled={isSelf} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          გაუქმება
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "ინახება..." : user ? "შენახვა" : "დამატება"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** დამატებითი როლები: მომხმარებელი ყველა თავის როლს ხედავს და ზედა პანელიდან მათ შორის გადადის. */
function ExtraRoles({ roles, selected, onChange }: { roles: RoleOption[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const toggle = (id: number, on: boolean) => onChange(on ? [...selected, id] : selected.filter((x) => x !== id));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">დამატებითი როლები</legend>
      <p className="text-xs text-muted-foreground">არასავალდებულო — მაგ. რეგისტრატორი, რომელიც საწყობსაც მართავს</p>
      <ul className="mt-1 flex max-h-44 flex-col divide-y overflow-y-auto rounded-lg border">
        {roles.map((r) => {
          const id = Number(r.value);
          return (
            <li key={r.value}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm">
                <Switch checked={selected.includes(id)} onCheckedChange={(on) => toggle(id, on)} />
                {r.label}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
