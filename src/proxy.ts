import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { roleSwitch, routeRedirect } from "@/lib/route-access";

// ყველა დაცული მისამართი როლზეა მიბმული: /<როლის_კოდი>/... (წესები — src/lib/route-access.ts)
export default auth(async (req) => {
  const user = req.auth?.user;
  const roleCodes = user?.roles?.map((r) => r.code);
  const target = routeRedirect(req.nextUrl.pathname, user?.roleCode, roleCodes);
  if (target) return NextResponse.redirect(new URL(target, req.nextUrl));
  // სხვა საკუთარი როლის განყოფილება — ეს როლი აქტიური ხდება რენდერამდე (უფლებები — მხოლოდ აქტიური როლისა, auth.ts).
  // წინასწარი ჩატვირთვა (prefetch) როლს არ ცვლის — მხოლოდ ნამდვილი გადასვლა.
  const next = roleSwitch(req.nextUrl.pathname, user?.roleCode, roleCodes);
  if (next && user && !req.headers.has("next-router-prefetch")) {
    const role = await prisma.role.findUnique({ where: { code: next }, select: { id: true } });
    if (role) await prisma.user.update({ where: { id: Number(user.id) }, data: { activeRoleId: role.id } });
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
