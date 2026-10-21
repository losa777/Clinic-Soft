import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { getDbConfig } from "@/lib/db-config";

function createClient() {
  const adapter = new PrismaMariaDb({
    ...getDbConfig(),
    charset: "utf8mb4",
    connectionLimit: 10,
  });
  return new PrismaClient({ adapter });
}

// dev რეჟიმში hot reload-ისას ახალი pool-ები რომ არ შეიქმნას
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
