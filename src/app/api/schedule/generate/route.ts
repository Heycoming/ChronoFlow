/**
 * POST /api/schedule/generate
 *
 * Full-week AI schedule generation. Runs Reality Check first; if infeasible,
 * returns 422. On success, stores an unapproved ScheduleVersion and returns
 * the proposed blocks for Diff View rendering.
 *
 * Body (optional):
 *   { start?: ISO8601, end?: ISO8601, timezone?: string }
 *
 * Response (success):
 *   { ok: true, versionId, proposedBlocks, previousBlocks, summary, attempts, realityCheck }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { orchestrateSchedule } from "@/lib/schedule/orchestrate";

const BodySchema = z
  .object({
    start: z.iso.datetime().optional(),
    end: z.iso.datetime().optional(),
    timezone: z.string().optional(),
  })
  .optional();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const rateLimit = await checkRateLimit(session.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Daily AI generation limit reached (${rateLimit.remaining} remaining). Resets at ${rateLimit.resetAt.toISOString()}.` },
      { status: 429 },
    );
  }

  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setUTCHours(0, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 7);

  const windowStart = parsed.data?.start
    ? new Date(parsed.data.start)
    : defaultStart;
  const windowEnd = parsed.data?.end ? new Date(parsed.data.end) : defaultEnd;
  const timezone = parsed.data?.timezone ?? "America/New_York";

  try {
    console.log(`[api/schedule/generate] userId=${session.user.id}, window=${windowStart.toISOString()} → ${windowEnd.toISOString()}, tz=${timezone}`);
    const result = await orchestrateSchedule({
      userId: session.user.id,
      mode: "FULL_WEEK",
      windowStart,
      windowEnd,
      timezone,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, realityCheck: result.realityCheck },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[schedule/generate] Failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Generation failed" },
      { status: 500 },
    );
  }
}
