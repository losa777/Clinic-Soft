import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { getDbConfig } from "@/lib/db-config";

function createClient() {
  const adapter = new PrismaMariaDb({
    ...getDbConfig(),
    charset: "utf8mb4",
    connectionLimit: 10,
    // დრაივერის ნაგულისხმევი 1 წამი ქსელში მდებარე სერვერისთვის მცირეა (VPN, DNS-ით შემოწმება skip_name_resolve=OFF-ისას):
    // კავშირი წყდება, pool ცარიელი რჩება და მოთხოვნა ჩავარდება ("pool failed to retrieve a connection")
    connectTimeout: 10_000,
    // უმოქმედო კავშირი 5 წუთში იხურება, სანამ ქსელი/firewall ჩუმად გაწყვეტს
    idleTimeout: 300,
  });
  return new PrismaClient({
    adapter,
    // maxWait — ტრანზაქციის კავშირის მოლოდინი pool-იდან: ნაგულისხმევი 2 წამი ქსელურ ბაზაზე მცირეა, როცა
    // გვერდი პარალელურ მოთხოვნებს აგზავნის (P2028 "Unable to start a transaction in the given time")
    transactionOptions: { maxWait: 10_000, timeout: 10_000 },
  });
}

// dev რეჟიმში hot reload-ისას ახალი pool-ები რომ არ შეიქმნას
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
