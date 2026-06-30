import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./config.js";

let prisma: PrismaClient | null = null;

export async function getPrisma(): Promise<PrismaClient> {
  if (!prisma) {
    const adapter = new PrismaPg(config.databaseUrl);
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
