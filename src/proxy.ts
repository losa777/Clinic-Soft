import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rolePath } from "@/lib/roles";

// ყველა დაცული მისამართი როლზეა მიბმული: /<როლის_კოდი>/...
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const ownRole = req.auth?.user?.roleCode;
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl));

  // API მისამართები როლზე არ არის მიბმული: თითოეული თავად ამოწმებს სესიას და როლს (401/403)
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (pathname === "/login") {
    return ownRole ? redirectTo(rolePath(ownRole)) : NextResponse.next();
  }

  if (!ownRole) return redirectTo("/login");

  if (pathname.split("/")[1] !== ownRole) return redirectTo(rolePath(ownRole));

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
