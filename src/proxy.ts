import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { routeRedirect } from "@/lib/route-access";

// ყველა დაცული მისამართი როლზეა მიბმული: /<როლის_კოდი>/... (წესები — src/lib/route-access.ts)
export default auth((req) => {
  const target = routeRedirect(req.nextUrl.pathname, req.auth?.user?.roleCode);
  return target ? NextResponse.redirect(new URL(target, req.nextUrl)) : NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
