import type { DefaultSession } from "next-auth";

interface ClinicUserFields {
  firstName: string;
  lastName: string;
  /** აქტიური როლი (რამდენიმე როლის მომხმარებელს — ბოლოს არჩეული) */
  roleCode: string;
  roleName: string;
  /** ყველა როლი: მთავარი პირველია, შემდეგ დამატებითები (src/lib/roles.ts → hasRole) */
  roles: { code: string; name: string }[];
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
