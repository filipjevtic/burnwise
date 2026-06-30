import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, "prisma", "schema.prisma"),
  migrate: {
    url: process.env.DATABASE_URL ?? "postgresql://ats:ats@localhost:5432/ats",
  },
});
