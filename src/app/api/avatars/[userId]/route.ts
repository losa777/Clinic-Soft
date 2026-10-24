import { auth } from "@/auth";
import { AVATAR_SIZES, type AvatarSize } from "@/lib/avatar-url";
import { readAvatar } from "@/lib/avatars";

/**
 * პროფილის ფოტო (?s=64|256) — მხოლოდ შესული თანამშრომლებისთვის. მისამართში ვერსიაა (?v=), ამიტომ ბრაუზერი
 * ფოტოს ერთხელ ჩამოტვირთავს და იმახსოვრებს (immutable); შეცვლისას მისამართი იცვლება.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/avatars/[userId]">) {
  const session = await auth();
  if (!session?.user) return new Response("ავტორიზაცია საჭიროა", { status: 401 });
  const userId = Number((await params).userId);
  const size = Number(new URL(request.url).searchParams.get("s") ?? 64);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !AVATAR_SIZES.includes(size as AvatarSize)) return new Response("არასწორი მოთხოვნა", { status: 400 });
  const image = await readAvatar(userId, size as AvatarSize);
  if (!image) return new Response("ფოტო არ არის", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
