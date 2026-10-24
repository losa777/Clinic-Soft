"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, type AvatarUser } from "@/components/user-avatar";
import { removeAvatarAction, uploadAvatarAction } from "@/lib/avatar-actions";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES } from "@/lib/avatar-url";

/**
 * პროფილის ფოტოს ატვირთვა/წაშლა. forUserId — ადმინი სხვის ფოტოს ცვლის (არ არის — საკუთარი).
 * ფოტო ინახება კვადრატად მოჭრილი და შემცირებული (src/lib/avatars.ts).
 */
export function AvatarEditor({ user, forUserId }: { user: AvatarUser; forUserId?: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("ფოტო 5 მბ-ზე დიდია");
      return;
    }
    const data = new FormData();
    data.set("file", file);
    if (forUserId) data.set("userId", String(forUserId));
    startTransition(async () => {
      const res = await uploadAvatarAction(data);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeAvatarAction(forUserId);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar user={user} large className="size-24 text-2xl" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={pending}>
            <Camera />
            {pending ? "ინახება..." : user.avatar ? "ფოტოს შეცვლა" : "ფოტოს ატვირთვა"}
          </Button>
          {user.avatar && (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={pending}>
              <Trash2 />
              წაშლა
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG ან WebP, 5 მბ-მდე. ფოტო კვადრატად მოიჭრება.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}
