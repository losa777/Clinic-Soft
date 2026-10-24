"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { audit, clientIp } from "@/lib/audit";
import { checkLock } from "@/lib/login-guard";
import { minutesLeft } from "@/lib/login-lock";
import { endChatSessions } from "@/modules/chat/realtime/emit";

const INVALID_CREDENTIALS = "მომხმარებელი ან პაროლი არასწორია";

const loginSchema = z.object({
  username: z.string().trim().min(1, "შეიყვანეთ მომხმარებელი"),
  password: z.string().min(1, "შეიყვანეთ პაროლი"),
});

export type LoginState = { error?: string; username?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const username = field("username");
  const parsed = loginSchema.safeParse({ username, password: field("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_CREDENTIALS, username };
  }

  // დაბლოკილზე — მაშინვე დარჩენილი დროით (authorize-იც ამოწმებს — ფორმის გვერდის ავლით გაგზავნისთვის)
  const lockMessage = async () => {
    const lock = await checkLock(parsed.data.username, await clientIp());
    if (!lock) return null;
    const minutes = minutesLeft(lock.until, new Date());
    return lock.reason === "ip"
      ? `ამ კომპიუტერიდან ძალიან ბევრი წარუმატებელი ცდაა. სცადეთ ${minutes} წუთში`
      : `ძალიან ბევრი წარუმატებელი ცდა — შესვლა დროებით დაბლოკილია. სცადეთ ${minutes} წუთში ან მიმართეთ ადმინისტრატორს`;
  };

  try {
    // წარმატებისას signIn ისვრის redirect-ს; "/" გადაამისამართებს როლის გვერდზე
    await signIn("credentials", { ...parsed.data, redirectTo: "/" });
    return {};
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      // ეს ცდა შეიძლება ბოლო (მე-5) იყო — ბლოკი ახლავე გამოჩნდეს
      const locked = await lockMessage();
      if (locked) return { error: locked, username };
    }
    if (error instanceof AuthError) {
      return {
        error: error.type === "CredentialsSignin" ? INVALID_CREDENTIALS : "შესვლა ვერ მოხერხდა, სცადეთ თავიდან",
        username,
      };
    }
    throw error;
  }
}

export async function logout() {
  // ჩატი: ამ შესვლის კავშირები წყდება — სხვებთან „გასულია“ (თუ სხვა კომპიუტერზე შესული არ არის)
  const session = await auth();
  if (session?.user) {
    endChatSessions(Number(session.user.id), "logout", session.user.sid);
    await audit({ userId: Number(session.user.id), action: "logout", entity: "session" });
  }
  await signOut({ redirectTo: "/login" });
}
