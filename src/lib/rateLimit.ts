/**
 * Simple per-user rate limiter backed by PostgreSQL.
 * Tracks AI generation calls (Gemini API) per user per day.
 *
 * Default: 20 AI calls per user per day.
 */
import { prisma } from "@/lib/db";

const MAX_CALLS_PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY ?? 10);

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const count = await prisma.scheduleVersion.count({
    where: {
      userId,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });

  return {
    allowed: count < MAX_CALLS_PER_DAY,
    remaining: Math.max(0, MAX_CALLS_PER_DAY - count),
    resetAt: dayEnd,
  };
}
