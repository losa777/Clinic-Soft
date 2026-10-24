"use client";

import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type RoleRef, rolePath } from "@/lib/roles";

/**
 * ზედა პანელის როლი. რამდენიმე როლის მომხმარებელს — გადამრთველი: როლის არჩევა მის გვერდზე გადაყავს
 * (არჩეული როლი ინახება — src/lib/dal.ts requireRole). მიმდინარე როლი მისამართიდან ჩანს (/<კოდი>/...).
 */
export function RoleSwitcher({ roles, active }: { roles: RoleRef[]; active: RoleRef }) {
  const pathname = usePathname();
  const router = useRouter();
  const section = pathname.split("/")[1];
  const current = roles.find((r) => r.code === section) ?? active;

  if (roles.length < 2) return <p className="truncate text-xs text-muted-foreground">{current.name}</p>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex max-w-full items-center gap-0.5 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`როლი: ${current.name} — შეცვლა`}
      >
        <span className="truncate">{current.name}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        {roles.map((r) => (
          <DropdownMenuItem key={r.code} onClick={() => r.code !== current.code && router.push(rolePath(r.code))}>
            <Check className={r.code === current.code ? "" : "invisible"} />
            {r.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
