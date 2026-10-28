/**
 * მარშრუტზე წვდომა როლით (proxy.ts): ყოველი დაცული მისამართი /<როლის_კოდი>/...-შია და მხოლოდ ამ როლს ეკუთვნის.
 * აბრუნებს გადამისამართების მისამართს ან null-ს (გაგრძელება). სუფთა ფუნქცია — ტესტებისთვის.
 * API მისამართები აქ არ მოწმდება: თითოეული თავად ამოწმებს სესიას და უფლებას (401/403).
 * გამონაკლისი: SHARED_SECTIONS (/chat, /account — პაროლის შეცვლა, /issues — პრობლემის შეტყობინება) — ყველა შესული მომხმარებლისთვის, როლის მიუხედავად.
 * roleCode — აქტიური როლი (სხვა როლის გვერდიდან აქ გადადის); roleCodes — მომხმარებლის ყველა როლი (მთავარი + დამატებითი).
 */
const SHARED_SECTIONS = ["chat", "account", "issues"];

export function routeRedirect(
  pathname: string,
  roleCode: string | null | undefined,
  roleCodes: string[] = roleCode ? [roleCode] : [],
): string | null {
  if (pathname.startsWith("/api/")) return null;
  if (pathname === "/login") return roleCode ? `/${roleCode}` : null;
  if (!roleCode) return "/login";
  const section = pathname.split("/")[1];
  if (SHARED_SECTIONS.includes(section)) return null;
  return section === roleCode || roleCodes.includes(section) ? null : `/${roleCode}`;
}

/**
 * სხვა საკუთარი როლის განყოფილებაში გადასვლა (/<როლი>/...) — ეს როლი აქტიური ხდება (proxy.ts, გვერდის რენდერამდე,
 * რომ layout-მაც და გვერდმაც ერთი როლის უფლებები დაინახოს). აბრუნებს ახალი როლის კოდს ან null-ს.
 */
export function roleSwitch(pathname: string, roleCode: string | null | undefined, roleCodes: string[] = []): string | null {
  if (!roleCode || pathname.startsWith("/api/")) return null;
  const section = pathname.split("/")[1];
  return section !== roleCode && roleCodes.includes(section) ? section : null;
}
