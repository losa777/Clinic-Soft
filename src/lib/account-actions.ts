"use server";

import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { type ActionResult, failure } from "@/lib/action-result";
import { audit, clientIp } from "@/lib/audit";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { checkLock, recordAttempt } from "@/lib/login-guard";
import { minutesLeft } from "@/lib/login-lock";
import { type ChangePasswordInput, changePasswordSchema, passwordProblem } from "@/lib/password-policy";
import { fieldErrorsOf } from "@/lib/zod-errors";
import { endChatSessions } from "@/modules/chat/realtime/emit";

/**
 * საკუთარი პაროლის შეცვლა (ყველა როლი). ამჟამინდელი პაროლის არასწორი შეყვანა შესვლის წარუმატებელ ცდად ითვლება
 * (login_attempts) — დატოვებულ ღია სესიაში პაროლის გამოცნობა შეუძლებელია. წარმატებისას session_version იზრდება:
 * ყველა სესია (ამ და სხვა კომპიუტერებზე) და ჩატის კავშირი წყდება, მომხმარებელი ახალი პაროლით შედის.
 */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  const me = await requireUser();
  const userId = Number(me.id);
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return failure("შეასწორეთ მონიშნული ველები", fieldErrorsOf(parsed.error));

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, passwordHash: true } });
  if (!user) return failure("მომხმარებელი ვერ მოიძებნა");
  const problem = passwordProblem(parsed.data.next, user.username);
  if (problem) return failure("შეასწორეთ მონიშნული ველები", { next: problem });

  const ip = await clientIp();
  const lock = await checkLock(user.username, ip);
  if (lock) return failure(`ძალიან ბევრი არასწორი ცდა. სცადეთ ${minutesLeft(lock.until, new Date())} წუთში`);
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    await recordAttempt(user.username, ip, "failed");
    await audit({ userId, action: "password_failed", entity: "user", entityId: userId, details: "პაროლის შეცვლა: ამჟამინდელი პაროლი არასწორია" });
    return failure("შეასწორეთ მონიშნული ველები", { current: "ამჟამინდელი პაროლი არასწორია" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.next, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 }, passwordChangedAt: new Date() },
    });
    await audit({ userId, action: "password_change", entity: "user", entityId: userId, details: user.username }, tx);
  });
  endChatSessions(userId, "logout");
  // ყველა სესია უკვე ბათილია (session_version) — cookie იშლება და შესვლის გვერდზე შეტყობინება ჩანს
  await signOut({ redirectTo: "/login?changed=1" });
  return { ok: true, message: "პაროლი შეიცვალა" };
}
