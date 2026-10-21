/**
 * ახალი მომხმარებლის დამატება.
 * გაშვება: npm run user:create -- <username> <password> <სახელი> <გვარი> <როლის_კოდი>
 * მაგ.:    npm run user:create -- nino.b "Pass1234!" ნინო ბერიძე doctor
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

async function main() {
  const [username, password, firstName, lastName, roleCode] = process.argv.slice(2);
  const roleCodes = (await prisma.role.findMany({ orderBy: { id: "asc" } })).map((r) => r.code);

  if (!username || !password || !firstName || !lastName || !roleCode) {
    console.error(
      "გამოყენება: npm run user:create -- <username> <password> <სახელი> <გვარი> <როლის_კოდი>",
    );
    console.error(`როლის კოდები: ${roleCodes.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო");
    process.exitCode = 1;
    return;
  }

  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    console.error(`უცნობი როლი "${roleCode}". შესაძლო მნიშვნელობები: ${roleCodes.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  if (await prisma.user.findUnique({ where: { username } })) {
    console.error(`მომხმარებელი "${username}" უკვე არსებობს`);
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      firstName,
      lastName,
      roleId: role.id,
    },
  });
  console.log(`✔ დაემატა: ${user.username} — ${user.firstName} ${user.lastName} (${role.name})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
