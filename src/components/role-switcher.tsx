"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type RoleRef, rolePath } from "@/lib/roles";

/**
 * მიმდინარე როლი მისამართიდან (/<კოდი>/...). ზედა პანელი საერთო layout-შია და გადასვლისას თავიდან არ იხატება,
 * ამიტომ სესიის როლი (active) შეიძლება ძველი იყოს; საერთო განყოფილებებში (/chat, /account, /issues) — ბოლოს გახსნილი როლი.
 */
function useCurrentRole(roles: RoleRef[], active: RoleRef): RoleRef {
  const section = usePathname().split("/")[1];
  const [last, setLast] = useState(active);
  const here = roles.find((r) => r.code === section);
  // წინა რენდერიდან დამახსოვრებული მნიშვნელობა (React: „state-ის შენახვა წინა რენდერებიდან“)
  if (here && here.code !== last.code) setLast(here);
  return here ?? last;
}

/** ლოგო → მიმდინარე როლის მთავარი გვერდი. */
export function HomeLink({ roles, active, children }: { roles: RoleRef[]; active: RoleRef; children: React.ReactNode }) {
  const current = useCurrentRole(roles, active);
  return (
    <Link href={rolePath(current.code)} className="shrink-0">
      {children}
    </Link>
  );
}

/**
 * ზედა პანელის როლი. რამდენიმე როლის მომხმარებელს — გადამრთველი: როლის არჩევა მის გვერდზე გადაყავს
 * (როლი აქტიური ხდება გადასვლისას — src/proxy.ts).
 */
export function RoleSwitcher({ roles, active }: { roles: RoleRef[]; active: RoleRef }) {
  const router = useRouter();
  const current = useCurrentRole(roles, active);
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
