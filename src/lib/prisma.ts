import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Prisma runtime connection for Neon PostgreSQL.
 *
 * The previous @prisma/adapter-pg driver needed outbound TCP port 5432.
 * Neon uses a WebSocket transport through @prisma/adapter-neon, which is
 * useful when a local network blocks PostgreSQL TCP traffic.
 *
 * Keep DATABASE_URL as the pooled Neon URL. DIRECT_URL is reserved for
 * Prisma CLI migrations and is NOT used by this runtime client.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

// One client per Node.js process, including during Next.js hot reload.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
