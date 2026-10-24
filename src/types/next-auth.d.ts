import type { DefaultSession } from "next-auth";

interface ClinicUserFields {
  firstName: string;
  lastName: string;
  roleCode: string;
  roleName: string;
  /** როლის უფლებების კოდები (src/lib/permissions.ts) */
  permissions: string[];
  /** შესვლის (სესიის) იდენტიფიკატორი — ჩატის კავშირებისთვის; ძველ სესიებს არ აქვს */
  sid?: string;
  /** სესიის ვერსია (users.session_version) — პაროლის შეცვლისას ძველი სესიები უქმდება */
  sv?: number;
}

declare module "next-auth" {
  interface User extends ClinicUserFields {
    id?: string;
  }

  interface Session {
    user: ClinicUserFields & { id: string } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT extends ClinicUserFields {
    id: string;
  }
}
