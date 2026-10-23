"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
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

  try {
    // წარმატებისას signIn ისვრის redirect-ს; "/" გადაამისამართებს როლის გვერდზე
    await signIn("credentials", { ...parsed.data, redirectTo: "/" });
    return {};
  } catch (error) {
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
  if (session?.user) endChatSessions(Number(session.user.id), "logout", session.user.sid);
  await signOut({ redirectTo: "/login" });
}
