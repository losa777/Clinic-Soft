import type { DefaultSession } from "next-auth";

interface ClinicUserFields {
  firstName: string;
  lastName: string;
  roleCode: string;
  roleName: string;
  /** როლის უფლებების კოდები (src/lib/permissions.ts) */
  permissions: string[];
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
