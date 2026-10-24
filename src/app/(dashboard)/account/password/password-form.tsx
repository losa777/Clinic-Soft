"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePasswordAction } from "@/lib/account-actions";
import { PASSWORD_MIN } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

/** წესები აკრეფისას (სერვერი იგივეს ამოწმებს — password-policy.ts). */
function rules(password: string, username: string) {
  return [
    { ok: password.length >= PASSWORD_MIN, label: `მინიმუმ ${PASSWORD_MIN} სიმბოლო` },
    { ok: /\p{L}/u.test(password) && /\d/.test(password), label: "ასოც და ციფრიც" },
    { ok: !password || username.length < 3 || !password.toLowerCase().includes(username.toLowerCase()), label: "არ შეიცავს მომხმარებლის სახელს" },
  ];
}

export function PasswordForm({ username }: { username: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // წარმატებისას სერვერი სესიას ხურავს და შესვლის გვერდზე გადადის
      const res = await changePasswordAction({ current, next, repeat });
      if (res && !res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.fieldErrors ? undefined : res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {/* პაროლის მენეჯერისთვის: რომელ ანგარიშს ეკუთვნის */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <FormField id="pw-current" label="ამჟამინდელი პაროლი" error={errors.current}>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-10" autoFocus />
      </FormField>
      <FormField id="pw-next" label="ახალი პაროლი" error={errors.next}>
        <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="h-10" />
      </FormField>
      <ul className="flex flex-col gap-1 text-xs" aria-label="პაროლის წესები">
        {rules(next, username).map((r) => (
          <li key={r.label} className={cn("flex items-center gap-1.5", r.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
            {r.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            {r.label}
          </li>
        ))}
      </ul>
      <FormField id="pw-repeat" label="გაიმეორეთ ახალი პაროლი" error={errors.repeat ?? (repeat && repeat !== next ? "პაროლები არ ემთხვევა" : undefined)}>
        <Input id="pw-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className="h-10" />
      </FormField>
      <p className="text-xs text-muted-foreground">შეცვლის შემდეგ ყველა კომპიუტერზე სისტემიდან გამოხვალთ — შედით ახალი პაროლით.</p>
      <Button type="submit" disabled={pending || !current || !next || !repeat} className="h-10">
        {pending ? "ინახება..." : "პაროლის შეცვლა"}
      </Button>
    </form>
  );
}
