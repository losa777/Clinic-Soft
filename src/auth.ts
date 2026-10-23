import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ALL_PERMISSIONS, FULL_ACCESS_ROLE } from "@/lib/permissions";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

/** სესიაში შესანახი ველები ბაზის ჩანაწერიდან. */
async function loadSessionUser(where: { id: number } | { username: string }) {
  const user = await prisma.user.findUnique({
    where,
    include: { role: { include: { permissions: { select: { permission: { select: { code: true } } } } } } },
  });
  if (!user || !user.isActive) return null;
  return {
    user,
    fields: {
      id: String(user.id),
      firstName: user.firstName,
      lastName: user.lastName,
      roleCode: user.role.code,
      roleName: user.role.name,
      // ადმინს ყველა უფლება აქვს (ბაზის მინიჭების მიუხედავად)
      permissions: user.role.code === FULL_ACCESS_ROLE ? ALL_PERMISSIONS : user.role.permissions.map((p) => p.permission.code),
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

        const found = await loadSessionUser({ username: parsed.data.username });
        // იუზერის არარსებობა და არასწორი პაროლი ერთნაირად null-ს აბრუნებს
        if (!found) return null;
        if (!(await bcrypt.compare(parsed.data.password, found.user.passwordHash))) return null;
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
      return found ? { ...token, ...found.fields } : null;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.firstName = token.firstName;
      session.user.lastName = token.lastName;
      session.user.roleCode = token.roleCode;
      session.user.roleName = token.roleName;
      session.user.permissions = token.permissions ?? [];
      session.user.sid = token.sid;
      return session;
    },
  },
});
