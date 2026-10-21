import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { getDatabaseUrl } from "./src/lib/db-config";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: getDatabaseUrl(),
  },
});
