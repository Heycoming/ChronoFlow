/**
 * Prisma client singleton, backed by the Neon driver adapter.
 *
 * Prisma 7 made driver adapters the default — instantiating PrismaClient
 * without one throws "Using engine type 'client' requires either 'adapter'
 * or 'accelerateUrl'". `@prisma/adapter-neon` wraps Neon's serverless
 * driver, which also gives us pooled connections in Vercel's edge/nodejs
 * runtimes without an extra PgBouncer URL.
 *
 * The `globalForPrisma` guard keeps dev hot-reload from leaking clients.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
