import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { audit, clientIp } from "@/lib/audit";
import { checkLock, recordAttempt } from "@/lib/login-guard";
import { prisma } from "@/lib/db";
import { ALL_PERMISSIONS, FULL_ACCESS_ROLE } from "@/lib/permissions";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

/** დაბლოკილი შესვლა (ზედიზედ წარუმატებელი ცდები): login-ის ფორმა code-ით დარჩენილ დროს აჩვენებს. */
export class AccountLockedError extends CredentialsSignin {
  code = "locked";
}

/** არარსებულ მომხმარებელზეც bcrypt-ის შედარება — პასუხის დრო არ ამხელს, არსებობს თუ არა სახელი. */
let dummyHash: Promise<string> | null = null;
const dummyCompare = (password: string) => {
  dummyHash ??= bcrypt.hash("clinic-soft-dummy-password", 12);
  return dummyHash.then((h) => bcrypt.compare(password, h));
};

const ROLE_WITH_PERMISSIONS = { include: { permissions: { select: { permission: { select: { code: true } } } } } } as const;

/**
 * სესიაში შესანახი ველები ბაზის ჩანაწერიდან. roles — მთავარი როლი პირველია, შემდეგ დამატებითები;
 * roleCode/roleName — აქტიური (ბოლოს არჩეული) როლი; უფლებები — ყველა როლის ერთად.
 */
async function loadSessionUser(where: { id: number } | { username: string }) {
  const user = await prisma.user.findUnique({
    where,
    include: { role: ROLE_WITH_PERMISSIONS, extraRoles: { include: { role: ROLE_WITH_PERMISSIONS }, orderBy: { roleId: "asc" } } },
  });
  if (!user || !user.isActive) return null;
  const roles = [user.role, ...user.extraRoles.map((r) => r.role).filter((r) => r.id !== user.roleId)];
  const active = roles.find((r) => r.id === user.activeRoleId) ?? user.role;
  return {
    user,
    fields: {
      id: String(user.id),
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatarVersion,
      roleCode: active.code,
      roleName: active.name,
      roles: roles.map((r) => ({ code: r.code, name: r.name })),
      // პაროლის შეცვლისას იზრდება — ძველი სესიები უქმდება (jwt callback)
      sv: user.sessionVersion,
      // ადმინს ყველა უფლება აქვს (ბაზის მინიჭების მიუხედავად)
      permissions: roles.some((r) => r.code === FULL_ACCESS_ROLE)
        ? ALL_PERMISSIONS
        : [...new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.code)))],
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        username: { label: "მომხმარებელი" },
        password: { label: "პაროლი", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;
        const ip = await clientIp();
        // დაბლოკვა (src/lib/login-lock.ts) მოწმდება პაროლამდე: დაბლოკილზე სწორი პაროლიც არ მიიღება
        const lock = await checkLock(username, ip);
        if (lock) {
          await recordAttempt(username, ip, "blocked");
          await audit({ userId: null, action: "login_blocked", entity: "session", details: `მომხმარებელი: ${username}${lock.reason === "ip" ? " (IP დაბლოკილია)" : ""}` });
          throw new AccountLockedError();
        }

        const found = await loadSessionUser({ username });
        // იუზერის არარსებობა და არასწორი პაროლი ერთნაირად null-ს აბრუნებს; აუდიტში — ორივე (სახელით)
        if (!found) {
          await dummyCompare(password);
          await recordAttempt(username, ip, "failed");
          await audit({ userId: null, action: "login_failed", entity: "session", details: `მომხმარებელი: ${username}` });
          return null;
        }
        if (!(await bcrypt.compare(password, found.user.passwordHash))) {
          await recordAttempt(username, ip, "failed");
          await audit({ userId: found.user.id, action: "login_failed", entity: "session", details: "არასწორი პაროლი" });
          return null;
        }
        await recordAttempt(username, ip, "success");
        await audit({ userId: found.user.id, roleCode: found.fields.roleCode, action: "login", entity: "session" });
        return found.fields;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // sid — ამ შესვლის იდენტიფიკატორი: გასვლისას ჩატის მხოლოდ ამ შესვლის კავშირები წყდება (სხვა კომპიუტერზე — არა)
      if (user) return { ...token, ...user, id: user.id!, sid: crypto.randomUUID() };

      // ყოველ მოთხოვნაზე ვამოწმებთ ბაზაში: გათიშული/წაშლილი მომხმარებელი მაშინვე გადის,
      // როლის ან სახელის ცვლილება კი მაშინვე აისახება სესიაში
      const id = Number(token.id);
      const found = Number.isInteger(id) ? await loadSessionUser({ id }) : null;
      // პაროლი შეიცვალა (ამ ან სხვა კომპიუტერზე) — ძველი სესია აღარ მოქმედებს
      if (!found || (token.sv ?? 0) !== found.user.sessionVersion) return null;
      return { ...token, ...found.fields };
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.firstName = token.firstName;
      session.user.lastName = token.lastName;
      session.user.avatar = token.avatar ?? null;
      session.user.roleCode = token.roleCode;
      session.user.roleName = token.roleName;
      session.user.roles = token.roles ?? [{ code: token.roleCode, name: token.roleName }];
      session.user.permissions = token.permissions ?? [];
      session.user.sid = token.sid;
      return session;
    },
  },
});
