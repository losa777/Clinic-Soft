/**
 * მარშრუტზე წვდომა როლით (proxy.ts): ყოველი დაცული მისამართი /<როლის_კოდი>/...-შია და მხოლოდ ამ როლს ეკუთვნის.
 * აბრუნებს გადამისამართების მისამართს ან null-ს (გაგრძელება). სუფთა ფუნქცია — ტესტებისთვის.
 * API მისამართები აქ არ მოწმდება: თითოეული თავად ამოწმებს სესიას და უფლებას (401/403).
 */
export function routeRedirect(pathname: string, roleCode: string | null | undefined): string | null {
  if (pathname.startsWith("/api/")) return null;
  if (pathname === "/login") return roleCode ? `/${roleCode}` : null;
  if (!roleCode) return "/login";
  return pathname.split("/")[1] === roleCode ? null : `/${roleCode}`;
}
