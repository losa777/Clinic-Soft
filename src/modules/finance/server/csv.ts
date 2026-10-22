import "server-only";
import { auth } from "@/auth";
import { can, type PermissionCode } from "@/lib/permissions";

/**
 * CSV ექსპორტი Excel-ისთვის: UTF-8 BOM (ქართული სწორად ჩანს), მძიმით გამოყოფილი, ყველა ველი ბრჭყალებში.
 * ფორმულის ინექციისგან დაცვა: =, +, -, @ -ით დაწყებულ ტექსტს წინ ' ემატება (რიცხვები უცვლელია).
 */
function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvResponse(filename: string, header: string[], rows: (string | number | null)[][]): Response {
  const body = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** API მარშრუტის დაცვა (proxy /api/*-ს არ ამოწმებს): სესია და უფლება. */
export async function apiPermission(code: PermissionCode): Promise<Response | null> {
  const session = await auth();
  if (!session?.user) return new Response("ავტორიზაცია საჭიროა", { status: 401 });
  if (!can(session.user, code)) return new Response("წვდომა აკრძალულია", { status: 403 });
  return null;
}
